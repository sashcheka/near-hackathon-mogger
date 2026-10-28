#pragma once

#include <userver/storages/postgres/postgres_fwd.hpp>

#include "../domain/order.hpp"

namespace community_treasury {

class OrdersService {
 public:
  explicit OrdersService(userver::storages::postgres::ClusterPtr cluster,
                         std::string receiver_id = {});
  Order Create(const CreateOrderRequest& request) const;
  Order Get(const std::string& id) const;

 private:
  const userver::storages::postgres::ClusterPtr cluster_;
  const std::string receiver_id_;
};

}  // namespace community_treasury
