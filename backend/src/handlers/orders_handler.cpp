#include "orders_handler.hpp"

#include <userver/components/component.hpp>
#include <userver/formats/json.hpp>
#include <userver/storages/postgres/component.hpp>

#include "order_response.hpp"

namespace community_treasury {
namespace json = userver::formats::json;
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
  try {
    return CreatedOrderResponse(
        request, service_.Create(ParseRequest(request.RequestBody())));
  } catch (const json::Exception&) {
    return OrderErrorResponse(request, OrderErrorCode::kInvalidRequest);
  } catch (const OrderError& error) {
    return OrderErrorResponse(request, error.code);
  }
}

}  // namespace community_treasury
