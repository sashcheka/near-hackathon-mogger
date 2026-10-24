#include "purchase_handler.hpp"

#include <userver/clients/http/component.hpp>
#include <userver/components/component.hpp>
#include <userver/storages/postgres/component.hpp>
#include <userver/yaml_config/merge_schemas.hpp>

#include "order_response.hpp"

namespace community_treasury {
namespace json = userver::formats::json;
using Status = userver::server::http::HttpStatus;

PurchaseHandler::PurchaseHandler(
    const userver::components::ComponentConfig& config,
    const userver::components::ComponentContext& context)
    : HttpHandlerBase(config, context),
      model_(context.FindComponent<userver::components::HttpClient>()
                 .GetHttpClient(),
             config["ollama-url"].As<std::string>(),
             config["ollama-model"].As<std::string>()),
      service_(
          context.FindComponent<userver::components::Postgres>("postgres-db")
              .GetCluster(),
          model_) {}

std::string PurchaseHandler::HandleRequestThrow(
    const userver::server::http::HttpRequest& request,
    userver::server::request::RequestContext&) const {
  try {
    const auto value = json::FromString(request.RequestBody());
    if (!value.IsObject() || value.GetSize() != 2 ||
        !value["prompt"].IsString() || !value["budget_yocto"].IsString())
      throw OrderError(OrderErrorCode::kInvalidRequest);
    return CreatedOrderResponse(
        request, service_.Create(value["prompt"].As<std::string>(),
                                 value["budget_yocto"].As<std::string>()));
  } catch (const json::Exception&) {
    return OrderErrorResponse(request, OrderErrorCode::kInvalidRequest);
  } catch (const OrderError& error) {
    return OrderErrorResponse(request, error.code);
  } catch (const ModelError& error) {
    Status status = Status::kBadGateway;
    std::string_view code = "invalid_model_response";
    switch (error.code) {
      case ModelErrorCode::kUnavailable:
        status = Status::kServiceUnavailable;
        code = "model_unavailable";
        break;
      case ModelErrorCode::kTimeout:
        status = Status::kGatewayTimeout;
        code = "model_timeout";
        break;
      case ModelErrorCode::kNoMatch:
        status = Status::kNotFound;
        code = "no_matching_product";
        break;
      case ModelErrorCode::kInvalidResponse:
        break;
    }
    return JsonResponse(request, status, json::MakeObject("error", code));
  }
}

userver::yaml_config::Schema PurchaseHandler::GetStaticConfigSchema() {
  return userver::yaml_config::MergeSchemas<HttpHandlerBase>(R"(
type: object
description: Purchase request handler with local model selection
additionalProperties: false
properties:
    ollama-url:
        type: string
        description: Full Ollama chat endpoint, empty to disable model requests
    ollama-model:
        type: string
        description: Local Ollama model tag
)");
}

}  // namespace community_treasury
