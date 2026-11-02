#include "auth_repository.hpp"

#include <userver/storages/postgres/cluster.hpp>
#include <userver/storages/postgres/io/row_types.hpp>
#include <userver/storages/postgres/io/string_types.hpp>
#include <userver/storages/postgres/transaction.hpp>

namespace community_treasury::auth_repository {
namespace pg = userver::storages::postgres;

void InsertChallenge(const pg::ClusterPtr& cluster,
                     const AuthChallenge& challenge) {
  auto tx = cluster->Begin("issue_auth_challenge", pg::ClusterHostType::kMaster,
                           pg::Transaction::RW);
  tx.Execute("DELETE FROM auth_challenges WHERE expires_at <= now()");
  tx.Execute("DELETE FROM auth_sessions WHERE expires_at <= now()");
  tx.Execute(
      "INSERT INTO auth_challenges (nonce, account_id, recipient) "
      "VALUES ($1, $2, $3)",
      challenge.nonce, challenge.account_id, challenge.recipient);
  tx.Commit();
}

AuthChallenge FindChallenge(const pg::ClusterPtr& cluster,
                            const std::string& nonce) {
  const auto result = cluster->Execute(
      pg::ClusterHostType::kMaster,
      "SELECT nonce, account_id, recipient FROM auth_challenges "
      "WHERE nonce = $1 AND expires_at > now()",
      nonce);
  if (result.IsEmpty()) throw AuthError(AuthErrorCode::kInvalidChallenge);
  return result.AsSingleRow<AuthChallenge>(pg::kRowTag);
}

bool ConsumeChallenge(const pg::ClusterPtr& cluster,
                      const AuthChallenge& challenge,
                      const std::string& token_hash) {
  // Expiry is rechecked after RPC. Concurrent submissions can create one
  // session.
  const auto result = cluster->Execute(
      pg::ClusterHostType::kMaster,
      "WITH consumed AS (DELETE FROM auth_challenges WHERE nonce = $1 "
      "AND account_id = $2 AND recipient = $3 AND expires_at > now() "
      "RETURNING account_id) INSERT INTO auth_sessions (token_hash, "
      "account_id) "
      "SELECT $4, account_id FROM consumed RETURNING account_id",
      challenge.nonce, challenge.account_id, challenge.recipient, token_hash);
  return !result.IsEmpty();
}

std::optional<std::string> FindSession(const pg::ClusterPtr& cluster,
                                       const std::string& token_hash) {
  const auto result =
      cluster->Execute(pg::ClusterHostType::kMaster,
                       "SELECT account_id FROM auth_sessions "
                       "WHERE token_hash = $1 AND expires_at > now()",
                       token_hash);
  if (result.IsEmpty()) return std::nullopt;
  return result.AsSingleRow<std::string>();
}

void DeleteSession(const pg::ClusterPtr& cluster,
                   const std::string& token_hash) {
  cluster->Execute(pg::ClusterHostType::kMaster,
                   "DELETE FROM auth_sessions WHERE token_hash = $1",
                   token_hash);
}

}  // namespace community_treasury::auth_repository
