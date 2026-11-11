#pragma once

#include <string>
#include <string_view>
#include <userver/server/handlers/http_handler_base.hpp>

#include "../clients/near_rpc_client.hpp"

namespace community_treasury {

class BalanceHandler final : public userver::server::handlers::HttpHandlerBase {
 public:
  static constexpr std::string_view kName = "handler-balance";
  BalanceHandler(const userver::components::ComponentConfig& config,
                 const userver::components::ComponentContext& context);
  static userver::yaml_config::Schema GetStaticConfigSchema();
  std::string HandleRequestThrow(const userver::server::http::HttpRequest& request,
                                 userver::server::request::RequestContext&) const override;
 private:
  const NearRpcClient rpc_;
};

}  // namespace community_treasury
