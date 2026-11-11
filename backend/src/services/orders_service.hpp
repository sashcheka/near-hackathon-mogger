#pragma once

#include <vector>
#include <userver/storages/postgres/postgres_fwd.hpp>

#include "../domain/order.hpp"

namespace community_treasury {

class OrdersService {
 public:
  explicit OrdersService(userver::storages::postgres::ClusterPtr cluster,
                         std::string receiver_id = {});
  Order Create(const CreateOrderRequest& request, const std::string& buyer_id) const;
  Order Get(const std::string& id, const std::string& buyer_id) const;
  std::string CheckPolicy(const Order& order, const std::string& buyer_id) const;
  std::vector<Order> ListRecent(const std::string& buyer_id) const;

 private:
  const userver::storages::postgres::ClusterPtr cluster_;
  const std::string receiver_id_;
};

}  // namespace community_treasury
