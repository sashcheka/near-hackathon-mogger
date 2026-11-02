#include "auth_service.hpp"

#include <userver/crypto/base64.hpp>
#include <userver/crypto/hash.hpp>
#include <userver/crypto/random.hpp>
#include <utility>

#include "../domain/near_account.hpp"
#include "../domain/wallet_signature.hpp"
#include "../repositories/auth_repository.hpp"

namespace community_treasury {
namespace base64 = userver::crypto::base64;

AuthService::AuthService(userver::storages::postgres::ClusterPtr cluster,
                         userver::clients::http::Client& http,
                         std::string rpc_url, std::string recipient)
    : cluster_(std::move(cluster)),
      rpc_(http, std::move(rpc_url)),
      recipient_(std::move(recipient)) {
  if (recipient_.empty() || recipient_.size() > 256)
    throw std::runtime_error("Authentication recipient must have 1..256 bytes");
}

AuthChallenge AuthService::Issue(const std::string& account) const {
  if (!IsValidNearAccountId(account))
    throw AuthError(AuthErrorCode::kInvalidRequest);
  AuthChallenge challenge{
      base64::Base64Encode(userver::crypto::GenerateRandomBlock(32)), account,
      recipient_};
  auth_repository::InsertChallenge(cluster_, challenge);
  return challenge;
}

AuthSession AuthService::Verify(const std::string& nonce,
                                const std::string& public_key,
                                const std::string& signature) const {
  if (nonce.size() != 44) throw AuthError(AuthErrorCode::kInvalidRequest);
  const auto challenge = auth_repository::FindChallenge(cluster_, nonce);
  if (challenge.recipient != recipient_ ||
      !VerifyWalletSignature(ChallengeMessage(challenge), nonce,
                             challenge.recipient, public_key, signature))
    throw AuthError(AuthErrorCode::kUnauthorized);
  rpc_.VerifyAccountKey(challenge.account_id, public_key);
  const auto token =
      base64::Base64Encode(userver::crypto::GenerateRandomBlock(32));
  if (!auth_repository::ConsumeChallenge(cluster_, challenge,
                                         userver::crypto::hash::Sha256(token)))
    throw AuthError(AuthErrorCode::kInvalidChallenge);
  return {token, challenge.account_id};
}

}  // namespace community_treasury
