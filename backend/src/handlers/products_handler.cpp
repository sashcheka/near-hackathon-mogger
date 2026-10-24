#include "products_handler.hpp"

#include <userver/components/component.hpp>
#include <userver/formats/json.hpp>
#include <userver/http/content_type.hpp>
#include <userver/storages/postgres/component.hpp>

#include "../repositories/products_repository.hpp"

namespace community_treasury {

namespace json = userver::formats::json;

ProductsHandler::ProductsHandler(
    const userver::components::ComponentConfig& config,
    const userver::components::ComponentContext& context)
    : HttpHandlerBase(config, context),
      pg_cluster_(
          context.FindComponent<userver::components::Postgres>("postgres-db")
              .GetCluster()) {}

std::string ProductsHandler::HandleRequestThrow(
    const userver::server::http::HttpRequest& request,
    userver::server::request::RequestContext&) const {
  json::ValueBuilder products(json::Type::kArray);
  for (const auto& product : products_repository::List(pg_cluster_)) {
    products.PushBack(json::MakeObject("id", product.id, "name", product.name,
                                       "price_yocto", product.price_yocto));
  }

  request.GetHttpResponse().SetContentType(
      userver::http::content_type::kApplicationJson);
  return json::ToString(json::MakeObject("products", products.ExtractValue()));
}

}  // namespace community_treasury
