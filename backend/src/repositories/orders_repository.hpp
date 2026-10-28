#pragma once

#include <optional>
#include <string>
#include <userver/storages/postgres/postgres_fwd.hpp>

#include "../domain/order.hpp"

namespace community_treasury::orders_repository {

std::optional<std::string> FindPriceForShare(
    userver::storages::postgres::Transaction& transaction,
    const std::string& product_id);

Order Insert(userver::storages::postgres::Transaction& transaction,
             const CreateOrderRequest& request, const std::string& unit_price,
             const std::string& total, const std::string& receiver_id);

std::optional<Order> Find(
    const userver::storages::postgres::ClusterPtr& cluster,
    const std::string& id);

}  // namespace community_treasury::orders_repository
