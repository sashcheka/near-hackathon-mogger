#include "orders_service.hpp"

#include <algorithm>
#include <boost/multiprecision/cpp_int.hpp>
#include <userver/storages/postgres/cluster.hpp>
#include <userver/storages/postgres/transaction.hpp>
#include <utility>

#include "../repositories/orders_repository.hpp"

namespace community_treasury {
namespace {

using Amount = boost::multiprecision::uint256_t;

Amount ParseAmount(const std::string& value) {
  if (value.empty() || value.size() > 39 || value.front() == '0' ||
      !std::all_of(value.begin(), value.end(),
                   [](char c) { return c >= '0' && c <= '9'; })) {
    throw OrderError(OrderErrorCode::kInvalidRequest);
  }
  Amount result = 0;
  for (const char digit : value) result = result * 10 + (digit - '0');
  return result;
}

}  // namespace

OrdersService::OrdersService(userver::storages::postgres::ClusterPtr cluster)
    : cluster_(std::move(cluster)) {}

Order OrdersService::Create(const CreateOrderRequest& request) const {
  if (request.product_id.empty() || request.product_id.size() > 128 ||
      request.quantity < 1 || request.quantity > 1000) {
    throw OrderError(OrderErrorCode::kInvalidRequest);
  }
  const auto budget = ParseAmount(request.budget_yocto);
  namespace pg = userver::storages::postgres;
  auto transaction = cluster_->Begin(
      "create_order", pg::ClusterHostType::kMaster, pg::Transaction::RW);
  const auto price =
      orders_repository::FindPriceForShare(transaction, request.product_id);
  if (!price) throw OrderError(OrderErrorCode::kProductNotFound);

  // At most 39 price digits * 1000 units fits safely in 256 bits.
  const Amount total = ParseAmount(*price) * request.quantity;
  if (total > budget) throw OrderError(OrderErrorCode::kBudgetExceeded);

  auto order =
      orders_repository::Insert(transaction, request, *price, total.str());
  transaction.Commit();
  return order;
}

}  // namespace community_treasury
