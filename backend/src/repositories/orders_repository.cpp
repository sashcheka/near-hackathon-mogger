#include "orders_repository.hpp"

#include <userver/storages/postgres/io/integral_types.hpp>
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
    "budget_yocto) VALUES ($1, $2, $3::text::numeric, $4::text::numeric, "
    "$5::text::numeric) RETURNING id::text",
    pg::Query::NameLiteral{"insert_order"}};

}  // namespace

std::optional<std::string> FindPriceForShare(pg::Transaction& transaction,
                                             const std::string& product_id) {
  const auto result = transaction.Execute(kFindPrice, product_id);
  if (result.IsEmpty()) return std::nullopt;
  return result.AsSingleRow<std::string>();
}

Order Insert(pg::Transaction& transaction, const CreateOrderRequest& request,
             const std::string& unit_price, const std::string& total) {
  const auto result =
      transaction.Execute(kInsertOrder, request.product_id, request.quantity,
                          unit_price, total, request.budget_yocto);
  return {result.AsSingleRow<std::string>(),
          request.product_id,
          request.quantity,
          unit_price,
          total,
          request.budget_yocto};
}

}  // namespace community_treasury::orders_repository
