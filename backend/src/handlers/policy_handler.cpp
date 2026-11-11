#include "policy_handler.hpp"

#include <userver/components/component.hpp>
#include <userver/formats/json.hpp>
#include <userver/storages/postgres/component.hpp>

#include "../domain/near_account.hpp"
#include "../repositories/policies_repository.hpp"
#include "authentication.hpp"

namespace community_treasury {
namespace json = userver::formats::json;
namespace policy = policies_repository;
using Status = userver::server::http::HttpStatus;

PolicyHandler::PolicyHandler(const userver::components::ComponentConfig& config,
                             const userver::components::ComponentContext& context)
    : HttpHandlerBase(config, context),
      cluster_(context.FindComponent<userver::components::Postgres>("postgres-db").GetCluster()) {}

std::string PolicyHandler::HandleRequestThrow(
    const userver::server::http::HttpRequest& request,
    userver::server::request::RequestContext&) const {
  try {
    const auto buyer = AuthenticatedAccount(request, cluster_);
    const auto action = request.GetPathArg("action");
    using Method = userver::server::http::HttpMethod;
    if (action == "history" && request.GetMethod() == Method::kGet) {
      json::ValueBuilder decisions(json::Type::kArray);
      for (const auto& item : policy::Recent(cluster_, buyer))
        decisions.PushBack(json::MakeObject("product_id", item.product_id,
            "total_yocto", item.total, "decision", item.decision, "reason", item.reason));
      return JsonResponse(request, Status::kOk, json::MakeObject("decisions", decisions.ExtractValue()));
    }
    if (action != "settings")
      return JsonResponse(request, Status::kNotFound, json::MakeObject("error", "not_found"));
    if (request.GetMethod() == Method::kPut) {
      const auto body = json::FromString(request.RequestBody());
      if (!body.IsObject() || body.GetSize() != 3 || !body["max_order_yocto"].IsString() ||
          !body["max_unit_yocto"].IsString() || !body["allowed_merchant"].IsString())
        throw OrderError(OrderErrorCode::kInvalidRequest);
      const policy::Policy settings{body["max_order_yocto"].As<std::string>(),
          body["max_unit_yocto"].As<std::string>(), body["allowed_merchant"].As<std::string>()};
      if (!settings.max_order.empty()) ValidateBudget(settings.max_order);
      if (!settings.max_unit.empty()) ValidateBudget(settings.max_unit);
      if (!settings.merchant.empty() && !IsValidNearAccountId(settings.merchant))
        throw OrderError(OrderErrorCode::kInvalidRequest);
      policy::Save(cluster_, buyer, settings);
    }
    const auto settings = policy::Get(cluster_, buyer);
    return JsonResponse(request, Status::kOk, json::MakeObject(
        "max_order_yocto", settings.max_order, "max_unit_yocto", settings.max_unit,
        "allowed_merchant", settings.merchant));
  } catch (const AuthError& error) {
    return AuthErrorResponse(request, error.code);
  } catch (const json::Exception&) {
    return OrderErrorResponse(request, OrderErrorCode::kInvalidRequest);
  } catch (const OrderError& error) {
    return OrderErrorResponse(request, error.code);
  }
}

}  // namespace community_treasury
