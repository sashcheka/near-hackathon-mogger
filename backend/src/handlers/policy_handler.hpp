#pragma once

#include <string>
#include <string_view>
#include <userver/server/handlers/http_handler_base.hpp>
#include <userver/storages/postgres/postgres_fwd.hpp>

namespace community_treasury {

class PolicyHandler final : public userver::server::handlers::HttpHandlerBase {
 public:
  static constexpr std::string_view kName = "handler-policy";
  PolicyHandler(const userver::components::ComponentConfig& config,
                const userver::components::ComponentContext& context);
  std::string HandleRequestThrow(const userver::server::http::HttpRequest& request,
                                 userver::server::request::RequestContext&) const override;
 private:
  const userver::storages::postgres::ClusterPtr cluster_;
};

}  // namespace community_treasury
