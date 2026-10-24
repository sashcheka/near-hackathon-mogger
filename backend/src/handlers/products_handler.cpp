#include "products_handler.hpp"

#include <userver/components/component.hpp>
#include <userver/formats/json.hpp>
#include <userver/http/content_type.hpp>
#include <userver/storages/postgres/cluster.hpp>
#include <userver/storages/postgres/component.hpp>
#include <userver/storages/postgres/io/string_types.hpp>
#include <userver/storages/postgres/query.hpp>

namespace community_treasury {

namespace json = userver::formats::json;
namespace pg = userver::storages::postgres;

namespace {

const pg::Query kSelectProducts{
    "SELECT id, name, price_yocto::text AS price_yocto "
    "FROM products ORDER BY id",
    pg::Query::NameLiteral{"select_products"}};

}  // namespace

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
  const auto result =
      pg_cluster_->Execute(pg::ClusterHostType::kMaster, kSelectProducts);

  json::ValueBuilder products(json::Type::kArray);
  for (const auto& row : result) {
    products.PushBack(json::MakeObject("id", row["id"].As<std::string>(),
                                       "name", row["name"].As<std::string>(),
                                       "price_yocto",
                                       row["price_yocto"].As<std::string>()));
  }

  request.GetHttpResponse().SetContentType(
      userver::http::content_type::kApplicationJson);
  return json::ToString(json::MakeObject("products", products.ExtractValue()));
}

}  // namespace community_treasury
