#pragma once

#include <cstdint>
#include <stdexcept>
#include <string>

namespace community_treasury {

struct CreateOrderRequest {
  std::string product_id;
  std::int64_t quantity;
  std::string budget_yocto;
};

struct Order {
  std::string id;
  std::string product_id;
  std::int64_t quantity;
  std::string unit_price_yocto;
  std::string total_yocto;
  std::string budget_yocto;
};

enum class OrderErrorCode {
  kInvalidRequest,
  kProductNotFound,
  kBudgetExceeded
};

class OrderError final : public std::runtime_error {
 public:
  explicit OrderError(OrderErrorCode code)
      : std::runtime_error("Order rejected"), code(code) {}
  const OrderErrorCode code;
};

}  // namespace community_treasury
