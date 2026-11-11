#pragma once

#include <cstdint>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>

namespace community_treasury {

void ValidateBudget(std::string_view budget);

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
  std::string status = "pending_payment";
  std::optional<std::string> receiver_id = std::nullopt;
  std::string network_id = "testnet";
  std::optional<std::string> buyer_id = std::nullopt;
};

enum class OrderErrorCode {
  kInvalidRequest,
  kProductNotFound,
  kBudgetExceeded,
  kPolicyOrderLimit,
  kPolicyUnitLimit,
  kPolicyMerchant,
  kMerchantNotConfigured,
  kCheckoutConflict,
  kOrderNotFound
};

class OrderError final : public std::runtime_error {
 public:
  explicit OrderError(OrderErrorCode code)
      : std::runtime_error("Order rejected"), code(code) {}
  const OrderErrorCode code;
};

}  // namespace community_treasury
