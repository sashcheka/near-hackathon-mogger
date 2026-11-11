#include "orders_service.hpp"

#include <boost/multiprecision/cpp_int.hpp>
#include <boost/uuid/string_generator.hpp>
#include <userver/storages/postgres/cluster.hpp>
#include <userver/storages/postgres/transaction.hpp>
#include <utility>

#include "../domain/near_account.hpp"
#include "../repositories/orders_repository.hpp"
#include "../repositories/policies_repository.hpp"

namespace community_treasury {
namespace {

using Amount = boost::multiprecision::uint256_t;

Amount ParseAmount(const std::string& value) {
  ValidateBudget(value);
  Amount result = 0;
  for (const char digit : value) result = result * 10 + (digit - '0');
  return result;
}

std::string PolicyViolation(const policies_repository::Policy& policy,
                            const Amount& total, const Amount& unit,
                            const std::string& receiver) {
  if (!policy.max_order.empty() && total > ParseAmount(policy.max_order)) return "policy_order_limit";
  if (!policy.max_unit.empty() && unit > ParseAmount(policy.max_unit)) return "policy_unit_limit";
  if (!policy.merchant.empty() && receiver != policy.merchant) return "policy_merchant";
  return {};
}

}  // namespace

OrdersService::OrdersService(userver::storages::postgres::ClusterPtr cluster,
                             std::string receiver_id)
    : cluster_(std::move(cluster)), receiver_id_(std::move(receiver_id)) {}

Order OrdersService::Create(const CreateOrderRequest& request,
                            const std::string& buyer_id) const {
  if (!IsValidNearAccountId(buyer_id) || request.product_id.empty() ||
      request.product_id.size() > 128 ||
      request.quantity < 1 || request.quantity > 1000) {
    throw OrderError(OrderErrorCode::kInvalidRequest);
  }
  const auto budget = ParseAmount(request.budget_yocto);
  namespace pg = userver::storages::postgres;
  auto transaction = cluster_->Begin(
      "create_order", pg::ClusterHostType::kMaster, pg::Transaction::RW);
  const auto policy = policies_repository::Lock(transaction, buyer_id);
  const auto price =
      orders_repository::FindPriceForShare(transaction, request.product_id);
  if (!price) throw OrderError(OrderErrorCode::kProductNotFound);

  // At most 39 price digits * 1000 units fits safely in 256 bits.
  const Amount total = ParseAmount(*price) * request.quantity;
  std::optional<OrderErrorCode> rejection;
  std::string reason = "within_limits";
  if (total > budget) {
    rejection = OrderErrorCode::kBudgetExceeded;
    reason = "budget_exceeded";
  } else if (const auto violation = PolicyViolation(policy, total, ParseAmount(*price), receiver_id_);
             !violation.empty()) {
    reason = violation;
    rejection = violation == "policy_order_limit" ? OrderErrorCode::kPolicyOrderLimit
                : violation == "policy_unit_limit" ? OrderErrorCode::kPolicyUnitLimit
                                                   : OrderErrorCode::kPolicyMerchant;
  }
  policies_repository::Record(transaction, buyer_id, request.product_id,
                              request.quantity, *price, total.str(), receiver_id_,
                              rejection ? "blocked" : "allowed", reason);
  if (rejection) {
    transaction.Commit();
    throw OrderError(*rejection);
  }

  auto order = orders_repository::Insert(transaction, request, *price,
                                         total.str(), receiver_id_, buyer_id);
  transaction.Commit();
  return order;
}

Order OrdersService::Get(const std::string& id, const std::string& buyer_id) const {
  if (id.size() != 36) throw OrderError(OrderErrorCode::kInvalidRequest);
  try {
    (void)boost::uuids::string_generator{}(id);
  } catch (const std::runtime_error&) {
    throw OrderError(OrderErrorCode::kInvalidRequest);
  }
  auto order = orders_repository::Find(cluster_, id, buyer_id);
  if (!order) throw OrderError(OrderErrorCode::kOrderNotFound);
  return *order;
}

std::string OrdersService::CheckPolicy(const Order& order, const std::string& buyer_id) const {
  if (order.status != "pending_payment") return {};
  return PolicyViolation(policies_repository::Get(cluster_, buyer_id),
                         ParseAmount(order.total_yocto), ParseAmount(order.unit_price_yocto),
                         order.receiver_id.value_or(""));
}

std::vector<Order> OrdersService::ListRecent(const std::string& buyer_id) const {
  return orders_repository::ListRecent(cluster_, buyer_id);
}

}  // namespace community_treasury
