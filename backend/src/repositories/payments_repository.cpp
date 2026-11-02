#include "payments_repository.hpp"

#include <userver/storages/postgres/cluster.hpp>
#include <userver/storages/postgres/io/integral_types.hpp>
#include <userver/storages/postgres/io/row_types.hpp>
#include <userver/storages/postgres/io/string_types.hpp>
#include <userver/storages/postgres/transaction.hpp>

namespace community_treasury::payments_repository {
namespace pg = userver::storages::postgres;
namespace {
struct LockedOrder {
  std::string status;
  bool time_ok;
  bool snapshot_ok;
};
}  // namespace

std::optional<std::string> FindTransaction(const pg::ClusterPtr& cluster,
                                          const std::string& order_id) {
  const auto result = cluster->Execute(pg::ClusterHostType::kMaster,
      "SELECT transaction_hash FROM payments WHERE order_id = $1::uuid", order_id);
  if (result.IsEmpty()) return std::nullopt;
  return result.AsSingleRow<std::string>();
}

void Record(const pg::ClusterPtr& cluster, const Order& order,
             const std::string& hash, const VerifiedTransfer& transfer) {
  if (!order.buyer_id || !order.receiver_id)
    throw PaymentError(PaymentErrorCode::kOrderChanged);
  auto tx = cluster->Begin("record_payment", pg::ClusterHostType::kMaster,
                            pg::Transaction::RW);
  const auto rows = tx.Execute(
      "SELECT status, $3::text::numeric > EXTRACT(EPOCH FROM created_at) * 1000000000, "
      "network_id = $4 AND receiver_id IS NOT DISTINCT FROM $5 "
      "AND total_yocto = $6::text::numeric FROM orders "
      "WHERE id = $1::uuid AND buyer_id = $2 FOR UPDATE",
      order.id, *order.buyer_id, transfer.block_timestamp_ns, order.network_id,
      *order.receiver_id, order.total_yocto);
  if (rows.IsEmpty()) throw OrderError(OrderErrorCode::kOrderNotFound);
  const auto current = rows.AsSingleRow<LockedOrder>(pg::kRowTag);
  const auto previous = tx.Execute(
      "SELECT transaction_hash FROM payments WHERE order_id = $1::uuid", order.id);
  if (!previous.IsEmpty()) {
    if (previous.AsSingleRow<std::string>() != hash)
      throw PaymentError(PaymentErrorCode::kOrderAlreadyPaid);
    if (current.status != "paid" || !current.snapshot_ok)
      throw PaymentError(PaymentErrorCode::kOrderChanged);
    tx.Commit();
    return;
  }
  if (current.status != "pending_payment")
    throw PaymentError(PaymentErrorCode::kOrderAlreadyPaid);
  if (!current.snapshot_ok) throw PaymentError(PaymentErrorCode::kOrderChanged);
  if (!current.time_ok) throw PaymentError(PaymentErrorCode::kBeforeOrder);
  const auto inserted = tx.Execute(
      "INSERT INTO payments (order_id, network_id, transaction_hash, sender_id, "
      "receiver_id, amount_yocto, block_hash, block_timestamp_ns) VALUES "
      "($1::uuid, $2, $3, $4, $5, $6::text::numeric, $7, $8::text::numeric) "
      "ON CONFLICT DO NOTHING RETURNING order_id::text",
      order.id, order.network_id, hash, *order.buyer_id, *order.receiver_id,
      order.total_yocto, transfer.block_hash, transfer.block_timestamp_ns);
  if (inserted.IsEmpty()) throw PaymentError(PaymentErrorCode::kAlreadyUsed);
  tx.Execute("UPDATE orders SET status = 'paid' WHERE id = $1::uuid", order.id);
  tx.Commit();
}

}  // namespace community_treasury::payments_repository
