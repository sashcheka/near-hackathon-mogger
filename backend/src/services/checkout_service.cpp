#include "checkout_service.hpp"

#include <algorithm>
#include <boost/multiprecision/cpp_int.hpp>
#include <boost/uuid/string_generator.hpp>
#include <boost/uuid/uuid_io.hpp>
#include <userver/storages/postgres/cluster.hpp>
#include <userver/storages/postgres/io/integral_types.hpp>
#include <userver/storages/postgres/io/row_types.hpp>
#include <userver/storages/postgres/io/string_types.hpp>
#include <userver/storages/postgres/transaction.hpp>
#include <utility>

#include "../domain/near_account.hpp"
#include "../domain/order.hpp"
#include "../repositories/orders_repository.hpp"
#include "../repositories/policies_repository.hpp"

namespace community_treasury {
namespace pg = userver::storages::postgres;
namespace {
using Amount = boost::multiprecision::uint256_t;
namespace policies = policies_repository;
namespace orders = orders_repository;

Amount ParseAmount(const std::string& value) {
  ValidateBudget(value);
  Amount result = 0;
  for (char digit : value) result = result * 10 + (digit - '0');
  return result;
}

void ValidateId(const std::string& id) {
  try {
    if (id.size() == 36 && boost::uuids::to_string(boost::uuids::string_generator{}(id)) == id) return;
  } catch (const std::runtime_error&) {}
  throw OrderError(OrderErrorCode::kInvalidRequest);
}

struct Prepared {
  CheckoutRequestItem item;
  orders::PurchaseProduct product;
  std::string receiver;
  std::string total;
};

struct Identity { std::string buyer; std::string spec; };

std::string Spec(const std::string& budget, const std::vector<CheckoutRequestItem>& items) {
  std::string result = budget;
  for (const auto& item : items)
    result += ':' + std::to_string(item.product_id.size()) + ':' + item.product_id + ':' + std::to_string(item.quantity);
  return result;
}

void CheckIdentity(const Identity& value, const std::string& buyer, const std::string& spec) {
  if (value.buyer != buyer || value.spec != spec) throw OrderError(OrderErrorCode::kCheckoutConflict);
}
}  // namespace

CheckoutService::CheckoutService(pg::ClusterPtr cluster, std::string default_merchant)
    : cluster_(std::move(cluster)), default_merchant_(std::move(default_merchant)) {}

Checkout CheckoutService::Create(const std::string& id, const std::string& buyer,
                                 const std::string& budget, std::vector<CheckoutRequestItem> items) const {
  ValidateId(id);
  const auto max_budget = ParseAmount(budget);
  if (!IsValidNearAccountId(buyer) || items.empty() || items.size() > 20)
    throw OrderError(OrderErrorCode::kInvalidRequest);
  std::sort(items.begin(), items.end(), [](const auto& a, const auto& b) { return a.product_id < b.product_id; });
  for (std::size_t i = 0; i < items.size(); ++i) {
    if (items[i].product_id.empty() || items[i].product_id.size() > 128 ||
        items[i].quantity < 1 || items[i].quantity > 1000 ||
        (i && items[i - 1].product_id == items[i].product_id))
      throw OrderError(OrderErrorCode::kInvalidRequest);
  }
  const auto spec = Spec(budget, items);
  auto tx = cluster_->Begin("create_checkout", pg::ClusterHostType::kMaster, pg::Transaction::RW);
  const auto prior = tx.Execute("SELECT buyer_id, request_spec FROM checkouts WHERE id = $1::uuid", id);
  if (!prior.IsEmpty()) {
    CheckIdentity(prior.AsSingleRow<Identity>(pg::kRowTag), buyer, spec);
    tx.Commit();
    return Get(id, buyer);
  }
  const auto policy = policies::Lock(tx, buyer);
  std::vector<Prepared> prepared;
  Amount total = 0;
  for (const auto& item : items) {
    auto product = orders::FindProductForShare(tx, item.product_id);
    if (!product) throw OrderError(OrderErrorCode::kProductNotFound);
    auto receiver = product->merchant_id == "general" && product->merchant_account.empty()
                        ? default_merchant_ : product->merchant_account;
    if (!IsValidNearAccountId(receiver)) throw OrderError(OrderErrorCode::kMerchantNotConfigured);
    const Amount item_total = ParseAmount(product->price) * item.quantity;
    total += item_total;
    prepared.push_back({item, *product, receiver, item_total.str()});
  }
  std::optional<OrderErrorCode> rejection;
  std::string reason = "within_limits";
  if (total > max_budget) { rejection = OrderErrorCode::kBudgetExceeded; reason = "budget_exceeded"; }
  else if (!policy.max_order.empty() && total > ParseAmount(policy.max_order)) {
    rejection = OrderErrorCode::kPolicyOrderLimit; reason = "policy_order_limit";
  }
  for (const auto& entry : prepared) {
    if (!rejection && !policy.max_unit.empty() && ParseAmount(entry.product.price) > ParseAmount(policy.max_unit)) {
      rejection = OrderErrorCode::kPolicyUnitLimit; reason = "policy_unit_limit";
    }
    if (!rejection && !policy.merchant.empty() && entry.receiver != policy.merchant) {
      rejection = OrderErrorCode::kPolicyMerchant; reason = "policy_merchant";
    }
  }
  if (rejection) {
    for (const auto& entry : prepared)
      policies::Record(tx, buyer, entry.item.product_id, entry.item.quantity, entry.product.price,
                       entry.total, entry.receiver, "blocked", reason);
    tx.Commit();
    throw OrderError(*rejection);
  }
  const auto inserted = tx.Execute(
      "INSERT INTO checkouts (id, buyer_id, request_spec, total_yocto, budget_yocto) "
      "VALUES ($1::uuid, $2, $3, $4::text::numeric, $5::text::numeric) ON CONFLICT DO NOTHING RETURNING id::text",
      id, buyer, spec, total.str(), budget);
  if (inserted.IsEmpty()) {
    const auto existing = tx.Execute("SELECT buyer_id, request_spec FROM checkouts WHERE id = $1::uuid", id);
    CheckIdentity(existing.AsSingleRow<Identity>(pg::kRowTag), buyer, spec);
    tx.Commit();
    return Get(id, buyer);
  }
  for (const auto& entry : prepared) {
    auto order = orders::Insert(tx, {entry.item.product_id, entry.item.quantity, budget},
                                entry.product.price, entry.total, entry.receiver, buyer);
    tx.Execute("UPDATE orders SET checkout_id = $1::uuid WHERE id = $2::uuid", id, order.id);
    tx.Execute("INSERT INTO checkout_items (order_id, product_name, merchant_id, merchant_name) "
               "VALUES ($1::uuid, $2, $3, $4)", order.id, entry.product.name,
               entry.product.merchant_id, entry.product.merchant_name);
    policies::Record(tx, buyer, entry.item.product_id, entry.item.quantity, entry.product.price,
                     entry.total, entry.receiver, "allowed", "within_limits");
  }
  tx.Commit();
  return Get(id, buyer);
}

Checkout CheckoutService::Get(const std::string& id, const std::string& buyer) const {
  ValidateId(id);
  const auto rows = cluster_->Execute(pg::ClusterHostType::kMaster,
      "SELECT id::text, total_yocto::text, budget_yocto::text FROM checkouts WHERE id = $1::uuid AND buyer_id = $2", id, buyer);
  if (rows.IsEmpty()) throw OrderError(OrderErrorCode::kOrderNotFound);
  struct Header { std::string id; std::string total; std::string budget; };
  const auto header = rows.AsSingleRow<Header>(pg::kRowTag);
  const auto items = cluster_->Execute(pg::ClusterHostType::kMaster,
      "SELECT o.id::text, o.product_id, i.product_name, o.quantity, o.unit_price_yocto::text, "
      "o.total_yocto::text, i.merchant_id, i.merchant_name, COALESCE(o.receiver_id, ''), o.status "
      "FROM orders o JOIN checkout_items i ON i.order_id = o.id "
      "WHERE o.checkout_id = $1::uuid AND o.buyer_id = $2 ORDER BY i.merchant_id, o.id", id, buyer)
      .AsContainer<std::vector<CheckoutItem>>(pg::kRowTag);
  return {header.id, header.total, header.budget, items};
}

std::vector<Checkout> CheckoutService::List(const std::string& buyer) const {
  const auto ids = cluster_->Execute(pg::ClusterHostType::kMaster,
      "SELECT id::text FROM checkouts WHERE buyer_id = $1 ORDER BY created_at DESC, id DESC LIMIT 20", buyer)
      .AsContainer<std::vector<std::string>>();
  std::vector<Checkout> result;
  for (const auto& id : ids) result.push_back(Get(id, buyer));
  return result;
}

}  // namespace community_treasury
