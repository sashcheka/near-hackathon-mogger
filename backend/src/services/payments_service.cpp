#include "payments_service.hpp"

#include <utility>

#include "../domain/near_account.hpp"
#include "../repositories/payments_repository.hpp"

namespace community_treasury {

PaymentsService::PaymentsService(
    userver::storages::postgres::ClusterPtr cluster, const NearRpcClient& rpc)
    : cluster_(std::move(cluster)), rpc_(rpc), orders_(cluster_) {}

Order PaymentsService::Verify(const std::string& order_id,
                              const std::string& buyer,
                              const std::string& hash) const {
  if (!IsValidNearHash(hash))
    throw NearRpcError(NearRpcErrorCode::kInvalidRequest);
  auto order = orders_.Get(order_id, buyer);
  if (!order.receiver_id) throw PaymentError(PaymentErrorCode::kNotConfigured);
  if (order.network_id != "testnet")
    throw NearRpcError(NearRpcErrorCode::kWrongNetwork);
  const auto previous =
      payments_repository::FindTransaction(cluster_, order.id);
  if (previous) {
    if (*previous != hash)
      throw PaymentError(PaymentErrorCode::kOrderAlreadyPaid);
    if (order.status != "paid")
      throw PaymentError(PaymentErrorCode::kOrderChanged);
    return order;
  }
  if (order.status != "pending_payment")
    throw PaymentError(PaymentErrorCode::kOrderChanged);
  // Network calls finish before the recorder locks the order in PostgreSQL.
  const auto transfer =
      rpc_.VerifyTransfer(hash, buyer, *order.receiver_id, order.total_yocto);
  payments_repository::Record(cluster_, order, hash, transfer);
  order.status = "paid";
  return order;
}

}  // namespace community_treasury
