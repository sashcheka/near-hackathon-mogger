#include "checkout_handler.hpp"

#include <userver/components/component.hpp>
#include <userver/formats/json.hpp>
#include <userver/storages/postgres/component.hpp>

#include "../components/merchant_settings.hpp"
#include "authentication.hpp"

namespace community_treasury {
namespace json = userver::formats::json;
using Status = userver::server::http::HttpStatus;
namespace {
json::Value CheckoutJson(const Checkout& checkout) {
  json::ValueBuilder items(json::Type::kArray);
  for (const auto& item : checkout.items)
    items.PushBack(json::MakeObject("order_id", item.order_id, "product_id", item.product_id,
        "product_name", item.product_name, "quantity", item.quantity, "unit_price_yocto", item.unit_price,
        "total_yocto", item.total, "merchant_id", item.merchant_id, "merchant_name", item.merchant_name,
        "receiver_id", item.receiver, "status", item.status));
  return json::MakeObject("id", checkout.id, "total_yocto", checkout.total,
                          "budget_yocto", checkout.budget, "items", items.ExtractValue());
}
}  // namespace

CheckoutHandler::CheckoutHandler(const userver::components::ComponentConfig& config,
                                 const userver::components::ComponentContext& context)
    : HttpHandlerBase(config, context),
      cluster_(context.FindComponent<userver::components::Postgres>("postgres-db").GetCluster()),
      service_(cluster_, context.FindComponent<MerchantSettings>().AccountId()) {}

std::string CheckoutHandler::HandleRequestThrow(const userver::server::http::HttpRequest& request,
                                                userver::server::request::RequestContext&) const {
  try {
    const auto buyer = AuthenticatedAccount(request, cluster_);
    if (request.GetMethod() == userver::server::http::HttpMethod::kGet) {
      json::ValueBuilder result(json::Type::kArray);
      for (const auto& checkout : service_.List(buyer)) result.PushBack(CheckoutJson(checkout));
      return JsonResponse(request, Status::kOk, json::MakeObject("checkouts", result.ExtractValue()));
    }
    const auto body = json::FromString(request.RequestBody());
    if (!body.IsObject() || body.GetSize() != 3 || !body["id"].IsString() ||
        !body["budget_yocto"].IsString() || !body["items"].IsArray() ||
        body["items"].GetSize() > 20) throw OrderError(OrderErrorCode::kInvalidRequest);
    std::vector<CheckoutRequestItem> items;
    for (const auto& item : body["items"]) {
      if (!item.IsObject() || item.GetSize() != 2 || !item["product_id"].IsString() ||
          !item["quantity"].IsInt64()) throw OrderError(OrderErrorCode::kInvalidRequest);
      items.push_back({item["product_id"].As<std::string>(), item["quantity"].As<std::int64_t>()});
    }
    return JsonResponse(request, Status::kCreated, CheckoutJson(service_.Create(
        body["id"].As<std::string>(), buyer, body["budget_yocto"].As<std::string>(), std::move(items))));
  } catch (const AuthError& error) { return AuthErrorResponse(request, error.code); }
    catch (const json::Exception&) { return OrderErrorResponse(request, OrderErrorCode::kInvalidRequest); }
    catch (const OrderError& error) { return OrderErrorResponse(request, error.code); }
}

CheckoutDetailsHandler::CheckoutDetailsHandler(const userver::components::ComponentConfig& config,
                                                const userver::components::ComponentContext& context)
    : HttpHandlerBase(config, context),
      cluster_(context.FindComponent<userver::components::Postgres>("postgres-db").GetCluster()),
      service_(cluster_, "") {}

std::string CheckoutDetailsHandler::HandleRequestThrow(const userver::server::http::HttpRequest& request,
                                                       userver::server::request::RequestContext&) const {
  try {
    const auto buyer = AuthenticatedAccount(request, cluster_);
    return JsonResponse(request, Status::kOk, CheckoutJson(service_.Get(request.GetPathArg("checkout_id"), buyer)));
  } catch (const AuthError& error) { return AuthErrorResponse(request, error.code); }
    catch (const OrderError& error) { return OrderErrorResponse(request, error.code); }
}

}  // namespace community_treasury
