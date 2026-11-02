#pragma once

#include <optional>
#include <userver/storages/postgres/postgres_fwd.hpp>

#include "../domain/auth.hpp"

namespace community_treasury::auth_repository {

void InsertChallenge(const userver::storages::postgres::ClusterPtr& cluster,
                     const AuthChallenge& challenge);
AuthChallenge FindChallenge(
    const userver::storages::postgres::ClusterPtr& cluster,
    const std::string& nonce);
bool ConsumeChallenge(const userver::storages::postgres::ClusterPtr& cluster,
                      const AuthChallenge& challenge,
                      const std::string& token_hash);
std::optional<std::string> FindSession(
    const userver::storages::postgres::ClusterPtr& cluster,
    const std::string& token_hash);
void DeleteSession(const userver::storages::postgres::ClusterPtr& cluster,
                   const std::string& token_hash);

}  // namespace community_treasury::auth_repository
