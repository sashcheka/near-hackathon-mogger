#pragma once

#include <string_view>

namespace community_treasury {

// NEP-413 with no callback URL. Only Ed25519 keys are accepted.
bool VerifyWalletSignature(std::string_view message, std::string_view nonce,
                           std::string_view recipient,
                           std::string_view public_key,
                           std::string_view signature);

}  // namespace community_treasury
