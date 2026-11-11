#include "order_details_handler.hpp"

#include <userver/components/component.hpp>
#include <userver/storages/postgres/component.hpp>

#include "order_response.hpp"
#include "authentication.hpp"
#include "../repositories/payments_repository.hpp"

namespace community_treasury {

OrderDetailsHandler::OrderDetailsHandler(
    const userver::components::ComponentConfig& config,
    const userver::components::ComponentContext& context)
    : HttpHandlerBase(config, context),
      cluster_(
          context.FindComponent<userver::components::Postgres>("postgres-db")
              .GetCluster()),
      service_(cluster_) {}

std::string OrderDetailsHandler::HandleRequestThrow(
    const userver::server::http::HttpRequest& request,
    userver::server::request::RequestContext&) const {
  try {
    const auto buyer = AuthenticatedAccount(request, cluster_);
    const auto order = service_.Get(request.GetPathArg("order_id"), buyer);
    userver::formats::json::ValueBuilder body(OrderJson(order));
    body["policy_error"] = service_.CheckPolicy(order, buyer);
    body["transaction_hash"] = nullptr;
    if (order.status == "paid") {
      const auto hash = payments_repository::FindTransaction(cluster_, order.id);
      if (hash) body["transaction_hash"] = *hash;
    }
    body["payment"] = nullptr;
    if (order.receiver_id) {
      body["payment"] = userver::formats::json::MakeObject(
          "network_id", order.network_id, "receiver_id", *order.receiver_id,
          "asset", "NEAR", "amount_yocto", order.total_yocto);
    }
    return JsonResponse(request, userver::server::http::HttpStatus::kOk,
                        body.ExtractValue());
  } catch (const AuthError& error) {
    return AuthErrorResponse(request, error.code);
  } catch (const OrderError& error) {
    return OrderErrorResponse(request, error.code);
  }
}

}  // namespace community_treasury
