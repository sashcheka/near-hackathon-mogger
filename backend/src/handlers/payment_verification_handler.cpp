#include "payment_verification_handler.hpp"

#include <map>
#include <userver/clients/http/component.hpp>
#include <userver/components/component.hpp>
#include <userver/storages/postgres/component.hpp>
#include <userver/yaml_config/merge_schemas.hpp>

#include "order_response.hpp"
#include "authentication.hpp"

namespace community_treasury {
namespace json = userver::formats::json;
using Status = userver::server::http::HttpStatus;
namespace {
using Code = NearRpcErrorCode;
const std::map<Code, std::pair<Status, std::string_view>> kErrors{
    {Code::kInvalidRequest, {Status::kBadRequest, "invalid_request"}},
    {Code::kUnavailable, {Status::kServiceUnavailable, "rpc_unavailable"}},
    {Code::kTimeout, {Status::kGatewayTimeout, "rpc_timeout"}},
    {Code::kInvalidResponse, {Status::kBadGateway, "invalid_rpc_response"}},
    {Code::kWrongNetwork, {Status::kBadGateway, "rpc_wrong_network"}},
    {Code::kPending, {Status::kAccepted, "transaction_pending"}},
    {Code::kNotFound, {Status::kNotFound, "transaction_not_found"}},
    {Code::kFailed, {Status::kConflict, "transaction_failed"}},
    {Code::kMismatch, {Status::kConflict, "transaction_mismatch"}},
};
}  // namespace

PaymentVerificationHandler::PaymentVerificationHandler(
    const userver::components::ComponentConfig& config,
    const userver::components::ComponentContext& context)
    : HttpHandlerBase(config, context),
      cluster_(
          context.FindComponent<userver::components::Postgres>("postgres-db")
              .GetCluster()),
      orders_(cluster_),
      rpc_(context.FindComponent<userver::components::HttpClient>()
               .GetHttpClient(),
           config["rpc-url"].As<std::string>()) {}

std::string PaymentVerificationHandler::HandleRequestThrow(
    const userver::server::http::HttpRequest& request,
    userver::server::request::RequestContext&) const {
  try {
    const auto sender = AuthenticatedAccount(request, cluster_);
    const auto body = json::FromString(request.RequestBody());
    if (!body.IsObject() || body.GetSize() != 1 ||
        !body["transaction_hash"].IsString())
      throw OrderError(OrderErrorCode::kInvalidRequest);
    const auto order = orders_.Get(request.GetPathArg("order_id"), sender);
    if (!order.receiver_id)
      return JsonResponse(request, Status::kConflict,
                          json::MakeObject("error", "payment_not_configured"));
    if (order.network_id != "testnet") throw NearRpcError(Code::kWrongNetwork);
    const auto hash = body["transaction_hash"].As<std::string>();
    rpc_.VerifyTransfer(hash, sender, *order.receiver_id, order.total_yocto);
    return JsonResponse(request, Status::kOk,
                        json::MakeObject("verified", true, "order_id", order.id,
                                         "transaction_hash", hash, "sender_id",
                                         sender, "network_id", order.network_id,
                                         "order_status", order.status));
  } catch (const AuthError& error) {
    return AuthErrorResponse(request, error.code);
  } catch (const json::Exception&) {
    return OrderErrorResponse(request, OrderErrorCode::kInvalidRequest);
  } catch (const OrderError& error) {
    return OrderErrorResponse(request, error.code);
  } catch (const NearRpcError& error) {
    const auto& [status, code] = kErrors.at(error.code);
    return JsonResponse(request, status, json::MakeObject("error", code));
  }
}

userver::yaml_config::Schema
PaymentVerificationHandler::GetStaticConfigSchema() {
  return userver::yaml_config::MergeSchemas<HttpHandlerBase>(R"(
type: object
description: Read-only verification of an order's native NEAR Testnet transfer
additionalProperties: false
properties:
    rpc-url:
        type: string
        description: Testnet JSON-RPC endpoint, checked against its reported chain ID
)");
}

}  // namespace community_treasury
