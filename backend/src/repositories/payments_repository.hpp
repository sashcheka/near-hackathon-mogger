#pragma once

#include <optional>
#include <userver/storages/postgres/postgres_fwd.hpp>

#include "../domain/order.hpp"
#include "../domain/payment.hpp"

namespace community_treasury::payments_repository {

std::optional<std::string> FindTransaction(
    const userver::storages::postgres::ClusterPtr& cluster, const std::string& order_id);
void Record(const userver::storages::postgres::ClusterPtr& cluster,
             const Order& order, const std::string& hash,
             const VerifiedTransfer& transfer);

}  // namespace community_treasury::payments_repository
