#pragma once

#include <userver/formats/json.hpp>
#include <userver/http/content_type.hpp>
#include <userver/server/http/http_request.hpp>
#include <userver/server/http/http_response.hpp>

#include "../domain/order.hpp"

namespace community_treasury {

inline std::string JsonResponse(
    const userver::server::http::HttpRequest& request,
    userver::server::http::HttpStatus status,
    const userver::formats::json::Value& value) {
  request.GetHttpResponse().SetStatus(status);
  request.GetHttpResponse().SetContentType(
      userver::http::content_type::kApplicationJson);
  return userver::formats::json::ToString(value);
}

inline userver::formats::json::Value OrderJson(const Order& order) {
  return userver::formats::json::MakeObject(
      "id", order.id, "product_id", order.product_id, "quantity",
      order.quantity, "unit_price_yocto", order.unit_price_yocto, "total_yocto",
      order.total_yocto, "budget_yocto", order.budget_yocto, "status",
      order.status);
}

inline std::string CreatedOrderResponse(
    const userver::server::http::HttpRequest& request, const Order& order) {
  return JsonResponse(request, userver::server::http::HttpStatus::kCreated,
                      OrderJson(order));
}

inline std::string OrderErrorResponse(
    const userver::server::http::HttpRequest& request, OrderErrorCode code) {
  using Status = userver::server::http::HttpStatus;
  Status status = Status::kBadRequest;
  std::string_view message = "invalid_request";
  if (code == OrderErrorCode::kProductNotFound) {
    status = Status::kNotFound;
    message = "product_not_found";
  } else if (code == OrderErrorCode::kBudgetExceeded) {
    status = Status::kConflict;
    message = "budget_exceeded";
  } else if (code == OrderErrorCode::kOrderNotFound) {
    status = Status::kNotFound;
    message = "order_not_found";
  }
  return JsonResponse(request, status,
                      userver::formats::json::MakeObject("error", message));
}

}  // namespace community_treasury
