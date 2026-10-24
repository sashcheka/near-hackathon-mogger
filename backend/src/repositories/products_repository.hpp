#pragma once

#include <vector>

#include <userver/storages/postgres/postgres_fwd.hpp>

#include "../domain/product.hpp"

namespace community_treasury::products_repository {

std::vector<Product> List(
    const userver::storages::postgres::ClusterPtr& cluster);

}  // namespace community_treasury::products_repository
