#pragma once

#include <string>
#include <string_view>
#include <userver/components/component_fwd.hpp>
#include <userver/server/handlers/http_handler_base.hpp>

#include "../services/orders_service.hpp"

namespace community_treasury {

class OrdersHandler final : public userver::server::handlers::HttpHandlerBase {
 public:
  static constexpr std::string_view kName = "handler-orders";
  OrdersHandler(const userver::components::ComponentConfig& config,
                const userver::components::ComponentContext& context);
  std::string HandleRequestThrow(
      const userver::server::http::HttpRequest& request,
      userver::server::request::RequestContext&) const override;

 private:
  const OrdersService service_;
};

}  // namespace community_treasury
