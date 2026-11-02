#pragma once

#include <userver/storages/postgres/postgres_fwd.hpp>

#include "../clients/near_rpc_client.hpp"
#include "../domain/auth.hpp"

namespace community_treasury {

struct AuthSession {
  std::string token;
  std::string account_id;
};

class AuthService {
 public:
  AuthService(userver::storages::postgres::ClusterPtr cluster,
              userver::clients::http::Client& http, std::string rpc_url,
              std::string recipient);
  AuthChallenge Issue(const std::string& account) const;
  AuthSession Verify(const std::string& nonce, const std::string& public_key,
                     const std::string& signature) const;

 private:
  const userver::storages::postgres::ClusterPtr cluster_;
  const NearRpcClient rpc_;
  const std::string recipient_;
};

}  // namespace community_treasury
