#include "orders_repository.hpp"

#include <userver/storages/postgres/cluster.hpp>
#include <userver/storages/postgres/io/integral_types.hpp>
#include <userver/storages/postgres/io/optional.hpp>
#include <userver/storages/postgres/io/row_types.hpp>
#include <userver/storages/postgres/io/string_types.hpp>
#include <userver/storages/postgres/query.hpp>
#include <userver/storages/postgres/transaction.hpp>

namespace community_treasury::orders_repository {
namespace pg = userver::storages::postgres;
namespace {

const pg::Query kFindPrice{
    "SELECT price_yocto::text FROM products WHERE id = $1 FOR SHARE",
    pg::Query::NameLiteral{"find_order_product_price"}};

const pg::Query kInsertOrder{
    "INSERT INTO orders (product_id, quantity, unit_price_yocto, total_yocto, "
    "budget_yocto, receiver_id) VALUES ($1, $2, $3::text::numeric, "
    "$4::text::numeric, "
    "$5::text::numeric, NULLIF($6, '')) RETURNING id::text",
    pg::Query::NameLiteral{"insert_order"}};

const pg::Query kFindOrder{
    "SELECT id::text, product_id, quantity, unit_price_yocto::text, "
    "total_yocto::text, budget_yocto::text, status, receiver_id, network_id "
    "FROM orders WHERE id = $1::uuid",
    pg::Query::NameLiteral{"find_order"}};

}  // namespace

std::optional<std::string> FindPriceForShare(pg::Transaction& transaction,
                                             const std::string& product_id) {
  const auto result = transaction.Execute(kFindPrice, product_id);
  if (result.IsEmpty()) return std::nullopt;
  return result.AsSingleRow<std::string>();
}

Order Insert(pg::Transaction& transaction, const CreateOrderRequest& request,
             const std::string& unit_price, const std::string& total,
             const std::string& receiver_id) {
  const auto result =
      transaction.Execute(kInsertOrder, request.product_id, request.quantity,
                          unit_price, total, request.budget_yocto, receiver_id);
  Order order{result.AsSingleRow<std::string>(),
              request.product_id,
              request.quantity,
              unit_price,
              total,
              request.budget_yocto};
  if (!receiver_id.empty()) order.receiver_id = receiver_id;
  return order;
}

std::optional<Order> Find(const pg::ClusterPtr& cluster,
                          const std::string& id) {
  const auto result =
      cluster->Execute(pg::ClusterHostType::kMaster, kFindOrder, id);
  if (result.IsEmpty()) return std::nullopt;
  return result.AsSingleRow<Order>(pg::kRowTag);
}

}  // namespace community_treasury::orders_repository
