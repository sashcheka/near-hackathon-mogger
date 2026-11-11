#pragma once

#include <cstdint>
#include <string>
#include <vector>
#include <userver/storages/postgres/postgres_fwd.hpp>

namespace community_treasury {

struct CheckoutRequestItem {
  std::string product_id;
  std::int64_t quantity;
};

struct CheckoutItem {
  std::string order_id;
  std::string product_id;
  std::string product_name;
  std::int64_t quantity;
  std::string unit_price;
  std::string total;
  std::string merchant_id;
  std::string merchant_name;
  std::string receiver;
  std::string status;
};

struct Checkout {
  std::string id;
  std::string total;
  std::string budget;
  std::vector<CheckoutItem> items;
};

class CheckoutService {
 public:
  CheckoutService(userver::storages::postgres::ClusterPtr cluster, std::string default_merchant);
  Checkout Create(const std::string& id, const std::string& buyer,
                  const std::string& budget, std::vector<CheckoutRequestItem> items) const;
  Checkout Get(const std::string& id, const std::string& buyer) const;
  std::vector<Checkout> List(const std::string& buyer) const;
 private:
  const userver::storages::postgres::ClusterPtr cluster_;
  const std::string default_merchant_;
};

}  // namespace community_treasury
