#include "products_handler.hpp"

#include <userver/components/component.hpp>
#include <userver/formats/json.hpp>
#include <userver/http/content_type.hpp>
#include <userver/storages/postgres/component.hpp>

#include "../repositories/products_repository.hpp"
#include "../components/merchant_settings.hpp"

namespace community_treasury {

namespace json = userver::formats::json;

ProductsHandler::ProductsHandler(
    const userver::components::ComponentConfig& config,
    const userver::components::ComponentContext& context)
    : HttpHandlerBase(config, context),
      pg_cluster_(
          context.FindComponent<userver::components::Postgres>("postgres-db")
              .GetCluster()),
      default_merchant_(context.FindComponent<MerchantSettings>().AccountId()) {}

std::string ProductsHandler::HandleRequestThrow(
    const userver::server::http::HttpRequest& request,
    userver::server::request::RequestContext&) const {
  json::ValueBuilder products(json::Type::kArray);
  for (const auto& product : products_repository::List(pg_cluster_)) {
    products.PushBack(json::MakeObject("id", product.id, "name", product.name,
                                       "price_yocto", product.price_yocto,
                                       "merchant_id", product.merchant_id,
                                       "merchant_name", product.merchant_name,
                                       "merchant_ready", !product.merchant_account.empty() ||
                                         (product.merchant_id == "general" && !default_merchant_.empty())));
  }

  request.GetHttpResponse().SetContentType(
      userver::http::content_type::kApplicationJson);
  return json::ToString(json::MakeObject("products", products.ExtractValue()));
}

}  // namespace community_treasury
