#pragma once

#include "../clients/near_rpc_client.hpp"
#include "orders_service.hpp"

namespace community_treasury {

class PaymentsService {
 public:
  PaymentsService(userver::storages::postgres::ClusterPtr cluster,
                  const NearRpcClient& rpc);
  Order Verify(const std::string& order_id, const std::string& buyer,
               const std::string& hash) const;

 private:
  const userver::storages::postgres::ClusterPtr cluster_;
  const NearRpcClient& rpc_;
  const OrdersService orders_;
};

}  // namespace community_treasury
