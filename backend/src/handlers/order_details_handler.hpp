#pragma once

#include <string>
#include <string_view>
#include <userver/server/handlers/http_handler_base.hpp>

#include "../services/orders_service.hpp"

namespace community_treasury {

class OrderDetailsHandler final
    : public userver::server::handlers::HttpHandlerBase {
 public:
  static constexpr std::string_view kName = "handler-order-details";
  OrderDetailsHandler(const userver::components::ComponentConfig& config,
                      const userver::components::ComponentContext& context);
  std::string HandleRequestThrow(
      const userver::server::http::HttpRequest& request,
      userver::server::request::RequestContext&) const override;

 private:
  const OrdersService service_;
};

}  // namespace community_treasury
