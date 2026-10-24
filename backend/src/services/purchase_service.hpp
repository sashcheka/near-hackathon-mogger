#pragma once

#include "../clients/ollama_client.hpp"
#include "orders_service.hpp"

namespace community_treasury {

class PurchaseService {
 public:
  PurchaseService(userver::storages::postgres::ClusterPtr cluster,
                  const OllamaClient& model);
  Order Create(const std::string& prompt, const std::string& budget) const;

 private:
  const userver::storages::postgres::ClusterPtr cluster_;
  const OllamaClient& model_;
  const OrdersService orders_;
};

}  // namespace community_treasury
