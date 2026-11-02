#pragma once

#include <userver/server/handlers/http_handler_base.hpp>
#include <userver/storages/postgres/postgres_fwd.hpp>

#include "../services/auth_service.hpp"

namespace community_treasury {

class AuthHandler final : public userver::server::handlers::HttpHandlerBase {
 public:
  static constexpr std::string_view kName = "handler-auth";
  AuthHandler(const userver::components::ComponentConfig& config,
              const userver::components::ComponentContext& context);
  static userver::yaml_config::Schema GetStaticConfigSchema();
  std::string HandleRequestThrow(
      const userver::server::http::HttpRequest& request,
      userver::server::request::RequestContext&) const override;

 private:
  const userver::storages::postgres::ClusterPtr cluster_;
  const AuthService auth_;
};

}  // namespace community_treasury
