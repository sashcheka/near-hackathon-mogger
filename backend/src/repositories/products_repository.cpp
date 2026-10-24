#include "products_repository.hpp"

#include <userver/storages/postgres/cluster.hpp>
#include <userver/storages/postgres/io/row_types.hpp>
#include <userver/storages/postgres/io/string_types.hpp>
#include <userver/storages/postgres/query.hpp>

namespace community_treasury::products_repository {
namespace pg = userver::storages::postgres;
namespace {

const pg::Query kSelectProducts{
    "SELECT id, name, price_yocto::text FROM products ORDER BY id",
    pg::Query::NameLiteral{"select_products"}};

}  // namespace

std::vector<Product> List(const pg::ClusterPtr& cluster) {
  return cluster->Execute(pg::ClusterHostType::kMaster, kSelectProducts)
      .AsContainer<std::vector<Product>>(pg::kRowTag);
}

}  // namespace community_treasury::products_repository
