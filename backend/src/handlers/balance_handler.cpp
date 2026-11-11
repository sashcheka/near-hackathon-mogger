#include "balance_handler.hpp"

#include <userver/clients/http/component.hpp>
#include <userver/components/component.hpp>
#include <userver/formats/json.hpp>
#include <userver/yaml_config/merge_schemas.hpp>

#include "order_response.hpp"

namespace community_treasury {
namespace json = userver::formats::json;
using Status = userver::server::http::HttpStatus;

BalanceHandler::BalanceHandler(const userver::components::ComponentConfig& config,
                               const userver::components::ComponentContext& context)
    : HttpHandlerBase(config, context),
      rpc_(context.FindComponent<userver::components::HttpClient>().GetHttpClient(),
           config["rpc-url"].As<std::string>()) {}

std::string BalanceHandler::HandleRequestThrow(
    const userver::server::http::HttpRequest& request,
    userver::server::request::RequestContext&) const {
  request.GetHttpResponse().SetHeader(std::string_view{"Cache-Control"}, "no-store");
  try {
    return JsonResponse(request, Status::kOk,
        json::MakeObject("network_id", "testnet", "account_id", request.GetPathArg("account_id"),
                         "amount_yocto", rpc_.GetBalance(request.GetPathArg("account_id"))));
  } catch (const NearRpcError& error) {
    const auto status = error.code == NearRpcErrorCode::kInvalidRequest ? Status::kBadRequest
                        : error.code == NearRpcErrorCode::kTimeout ? Status::kGatewayTimeout
                        : error.code == NearRpcErrorCode::kUnavailable ? Status::kServiceUnavailable
                        : Status::kBadGateway;
    return JsonResponse(request, status, json::MakeObject("error",
        error.code == NearRpcErrorCode::kInvalidRequest ? "invalid_request" : "balance_unavailable"));
  }
}

userver::yaml_config::Schema BalanceHandler::GetStaticConfigSchema() {
  return userver::yaml_config::MergeSchemas<HttpHandlerBase>(R"(
type: object
description: Read an account balance from NEAR Testnet
additionalProperties: false
properties:
    rpc-url:
        type: string
        description: NEAR Testnet RPC endpoint
)");
}

}  // namespace community_treasury
