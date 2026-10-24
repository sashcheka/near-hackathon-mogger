#pragma once

#include <userver/storages/postgres/postgres_fwd.hpp>

#include "../domain/order.hpp"

namespace community_treasury {

class OrdersService {
 public:
  explicit OrdersService(userver::storages::postgres::ClusterPtr cluster);
  Order Create(const CreateOrderRequest& request) const;

 private:
  const userver::storages::postgres::ClusterPtr cluster_;
};

}  // namespace community_treasury
