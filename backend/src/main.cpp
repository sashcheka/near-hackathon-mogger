#include <string>
#include <string_view>

#include <userver/clients/dns/component.hpp>
#include <userver/components/minimal_server_component_list.hpp>
#include <userver/formats/json.hpp>
#include <userver/http/content_type.hpp>
#include <userver/server/handlers/http_handler_base.hpp>
#include <userver/server/http/http_response.hpp>
#include <userver/storages/postgres/component.hpp>
#include <userver/testsuite/testsuite_support.hpp>
#include <userver/utils/daemon_run.hpp>

#include "handlers/products_handler.hpp"

namespace community_treasury {

class HealthHandler final : public userver::server::handlers::HttpHandlerBase {
 public:
  static constexpr std::string_view kName = "handler-health";

  using userver::server::handlers::HttpHandlerBase::HttpHandlerBase;

  std::string HandleRequestThrow(
      const userver::server::http::HttpRequest& request,
      userver::server::request::RequestContext&) const override {
    request.GetHttpResponse().SetContentType(
        userver::http::content_type::kApplicationJson);
    return userver::formats::json::ToString(
        userver::formats::json::MakeObject("status", "ok"));
  }
};

}  // namespace community_treasury

int main(int argc, char* argv[]) {
  const auto components = userver::components::MinimalServerComponentList()
                              .Append<community_treasury::HealthHandler>()
                              .Append<community_treasury::ProductsHandler>()
                              .Append<userver::clients::dns::Component>()
                              .Append<userver::components::TestsuiteSupport>()
                              .Append<userver::components::Postgres>("postgres-db");
  return userver::utils::DaemonMain(argc, argv, components);
}
