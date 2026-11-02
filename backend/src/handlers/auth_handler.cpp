#include "auth_handler.hpp"

#include <userver/clients/http/component.hpp>
#include <userver/components/component.hpp>
#include <userver/storages/postgres/component.hpp>
#include <userver/yaml_config/merge_schemas.hpp>

#include "authentication.hpp"

namespace community_treasury {
namespace json = userver::formats::json;
using Status = userver::server::http::HttpStatus;

AuthHandler::AuthHandler(const userver::components::ComponentConfig& config,
                         const userver::components::ComponentContext& context)
    : HttpHandlerBase(config, context),
      cluster_(
          context.FindComponent<userver::components::Postgres>("postgres-db")
              .GetCluster()),
      auth_(cluster_,
            context.FindComponent<userver::components::HttpClient>()
                .GetHttpClient(),
            config["rpc-url"].As<std::string>(),
            config["recipient"].As<std::string>()) {}

std::string AuthHandler::HandleRequestThrow(
    const userver::server::http::HttpRequest& request,
    userver::server::request::RequestContext&) const {
  request.GetHttpResponse().SetHeader(std::string_view{"Cache-Control"}, "no-store");
  try {
    const auto action = request.GetPathArg("action");
    const auto method = request.GetMethod();
    using Method = userver::server::http::HttpMethod;
    if (action == "session" && method == Method::kGet)
      return JsonResponse(
          request, Status::kOk,
          json::MakeObject("account_id",
                           AuthenticatedAccount(request, cluster_)));
    if (action == "session" && method == Method::kDelete) {
      auth_repository::DeleteSession(cluster_, SessionHash(request));
      return JsonResponse(request, Status::kOk,
                          json::MakeObject("signed_out", true));
    }
    if (method != Method::kPost ||
        (action != "challenge" && action != "verify"))
      return JsonResponse(request, Status::kNotFound,
                          json::MakeObject("error", "not_found"));
    const auto body = json::FromString(request.RequestBody());
    if (action == "challenge") {
      if (!body.IsObject() || body.GetSize() != 1 ||
          !body["account_id"].IsString())
        throw AuthError(AuthErrorCode::kInvalidRequest);
      const auto challenge = auth_.Issue(body["account_id"].As<std::string>());
      return JsonResponse(
          request, Status::kCreated,
          json::MakeObject("nonce", challenge.nonce, "message",
                           ChallengeMessage(challenge), "recipient",
                           challenge.recipient, "expires_in", 300));
    }
    if (!body.IsObject() || body.GetSize() != 3 || !body["nonce"].IsString() ||
        !body["public_key"].IsString() || !body["signature"].IsString())
      throw AuthError(AuthErrorCode::kInvalidRequest);
    const auto session = auth_.Verify(body["nonce"].As<std::string>(),
                                      body["public_key"].As<std::string>(),
                                      body["signature"].As<std::string>());
    return JsonResponse(
        request, Status::kOk,
        json::MakeObject("token", session.token, "account_id",
                         session.account_id, "expires_in", 3600));
  } catch (const json::Exception&) {
    return AuthErrorResponse(request, AuthErrorCode::kInvalidRequest);
  } catch (const AuthError& error) {
    return AuthErrorResponse(request, error.code);
  } catch (const NearRpcError& error) {
    using Code = NearRpcErrorCode;
    if (error.code == Code::kMismatch)
      return AuthErrorResponse(request, AuthErrorCode::kUnauthorized);
    const auto status = error.code == Code::kTimeout ? Status::kGatewayTimeout
                        : error.code == Code::kUnavailable
                            ? Status::kServiceUnavailable
                            : Status::kBadGateway;
    return JsonResponse(request, status,
                        json::MakeObject("error", "auth_rpc_failed"));
  }
}

userver::yaml_config::Schema AuthHandler::GetStaticConfigSchema() {
  return userver::yaml_config::MergeSchemas<HttpHandlerBase>(R"(
type: object
description: NEP-413 wallet authentication
additionalProperties: false
properties:
    rpc-url:
        type: string
        description: Testnet RPC endpoint for access-key verification
    recipient:
        type: string
        description: Fixed application identity shown in wallet signing requests
)");
}

}  // namespace community_treasury
