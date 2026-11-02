#pragma once

#include <stdexcept>
#include <string>

namespace community_treasury {

struct VerifiedTransfer {
  std::string block_hash;
  std::string block_timestamp_ns;
};

enum class PaymentErrorCode {
  kAlreadyUsed,
  kOrderAlreadyPaid,
  kBeforeOrder,
  kOrderChanged,
  kNotConfigured
};

class PaymentError final : public std::runtime_error {
 public:
  explicit PaymentError(PaymentErrorCode code)
      : std::runtime_error("Payment could not be recorded"), code(code) {}
  const PaymentErrorCode code;
};

}  // namespace community_treasury
