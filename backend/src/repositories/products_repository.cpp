#include "products_repository.hpp"

#include <userver/storages/postgres/cluster.hpp>
#include <userver/storages/postgres/io/row_types.hpp>
#include <userver/storages/postgres/io/string_types.hpp>
#include <userver/storages/postgres/query.hpp>

namespace community_treasury::products_repository {
namespace pg = userver::storages::postgres;
namespace {

const pg::Query kSelectProducts{
    "SELECT p.id, p.name, p.price_yocto::text, m.id, m.name, COALESCE(m.account_id, '') "
    "FROM products p JOIN merchants m ON m.id = p.merchant_id ORDER BY p.id",
    pg::Query::NameLiteral{"select_products"}};

}  // namespace

std::vector<Product> List(const pg::ClusterPtr& cluster) {
  return cluster->Execute(pg::ClusterHostType::kMaster, kSelectProducts)
      .AsContainer<std::vector<Product>>(pg::kRowTag);
}

}  // namespace community_treasury::products_repository
