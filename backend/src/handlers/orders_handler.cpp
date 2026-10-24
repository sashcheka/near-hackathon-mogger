#include "orders_handler.hpp"

#include <userver/components/component.hpp>
#include <userver/formats/json.hpp>
#include <userver/http/content_type.hpp>
#include <userver/server/http/http_response.hpp>
#include <userver/storages/postgres/component.hpp>

namespace community_treasury {
namespace json = userver::formats::json;
using HttpStatus = userver::server::http::HttpStatus;
namespace {

CreateOrderRequest ParseRequest(const std::string& body) {
  const auto value = json::FromString(body);
  if (!value.IsObject() || value.GetSize() != 3 ||
      !value["product_id"].IsString() || !value["quantity"].IsInt64() ||
      !value["budget_yocto"].IsString()) {
    throw OrderError(OrderErrorCode::kInvalidRequest);
  }
  return {value["product_id"].As<std::string>(),
          value["quantity"].As<std::int64_t>(),
          value["budget_yocto"].As<std::string>()};
}

std::string Error(const userver::server::http::HttpRequest& request,
                  HttpStatus status, std::string_view code) {
  request.GetHttpResponse().SetStatus(status);
  return json::ToString(json::MakeObject("error", code));
}

}  // namespace

OrdersHandler::OrdersHandler(
    const userver::components::ComponentConfig& config,
    const userver::components::ComponentContext& context)
    : HttpHandlerBase(config, context),
      service_(
          context.FindComponent<userver::components::Postgres>("postgres-db")
              .GetCluster()) {}

std::string OrdersHandler::HandleRequestThrow(
    const userver::server::http::HttpRequest& request,
    userver::server::request::RequestContext&) const {
  request.GetHttpResponse().SetContentType(
      userver::http::content_type::kApplicationJson);
  try {
    const auto order = service_.Create(ParseRequest(request.RequestBody()));
    request.GetHttpResponse().SetStatus(HttpStatus::kCreated);
    return json::ToString(json::MakeObject(
        "id", order.id, "product_id", order.product_id, "quantity",
        order.quantity, "unit_price_yocto", order.unit_price_yocto,
        "total_yocto", order.total_yocto, "budget_yocto", order.budget_yocto,
        "status", "pending_payment"));
  } catch (const json::Exception&) {
    return Error(request, HttpStatus::kBadRequest, "invalid_request");
  } catch (const OrderError& error) {
    switch (error.code) {
      case OrderErrorCode::kProductNotFound:
        return Error(request, HttpStatus::kNotFound, "product_not_found");
      case OrderErrorCode::kBudgetExceeded:
        return Error(request, HttpStatus::kConflict, "budget_exceeded");
      case OrderErrorCode::kInvalidRequest:
        return Error(request, HttpStatus::kBadRequest, "invalid_request");
    }
    throw;
  }
}

}  // namespace community_treasury
