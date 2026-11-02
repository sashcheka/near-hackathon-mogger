#pragma once

#include <stdexcept>
#include <string>

namespace community_treasury {

struct AuthChallenge {
  std::string nonce;
  std::string account_id;
  std::string recipient;
};

enum class AuthErrorCode { kInvalidRequest, kInvalidChallenge, kUnauthorized };

class AuthError final : public std::runtime_error {
 public:
  explicit AuthError(AuthErrorCode code)
      : std::runtime_error("Wallet authentication failed"), code(code) {}
  const AuthErrorCode code;
};

inline std::string ChallengeMessage(const AuthChallenge& challenge) {
  return "Sign in to Community Treasury on NEAR Testnet.\nAccount: " +
         challenge.account_id + "\nThis does not authorize payments.";
}

}  // namespace community_treasury
