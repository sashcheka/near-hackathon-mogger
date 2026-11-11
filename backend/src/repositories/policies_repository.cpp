#include "policies_repository.hpp"

#include <userver/storages/postgres/cluster.hpp>
#include <userver/storages/postgres/io/integral_types.hpp>
#include <userver/storages/postgres/io/row_types.hpp>
#include <userver/storages/postgres/io/string_types.hpp>
#include <userver/storages/postgres/transaction.hpp>

namespace community_treasury::policies_repository {
namespace pg = userver::storages::postgres;

Policy Get(const pg::ClusterPtr& cluster, const std::string& buyer) {
  const auto rows = cluster->Execute(pg::ClusterHostType::kMaster,
      "SELECT COALESCE(max_order_yocto::text, ''), COALESCE(max_unit_yocto::text, ''), "
      "COALESCE(allowed_merchant, '') FROM purchase_policies WHERE buyer_id = $1", buyer);
  return rows.IsEmpty() ? Policy{} : rows.AsSingleRow<Policy>(pg::kRowTag);
}

void Save(const pg::ClusterPtr& cluster, const std::string& buyer, const Policy& policy) {
  cluster->Execute(pg::ClusterHostType::kMaster,
      "INSERT INTO purchase_policies (buyer_id, max_order_yocto, max_unit_yocto, allowed_merchant) "
      "VALUES ($1, NULLIF($2, '')::numeric, NULLIF($3, '')::numeric, NULLIF($4, '')) "
      "ON CONFLICT (buyer_id) DO UPDATE SET max_order_yocto = EXCLUDED.max_order_yocto, "
      "max_unit_yocto = EXCLUDED.max_unit_yocto, allowed_merchant = EXCLUDED.allowed_merchant",
      buyer, policy.max_order, policy.max_unit, policy.merchant);
}

Policy Lock(pg::Transaction& tx, const std::string& buyer) {
  tx.Execute("INSERT INTO purchase_policies (buyer_id) VALUES ($1) ON CONFLICT DO NOTHING", buyer);
  return tx.Execute(
      "SELECT COALESCE(max_order_yocto::text, ''), COALESCE(max_unit_yocto::text, ''), "
      "COALESCE(allowed_merchant, '') FROM purchase_policies WHERE buyer_id = $1 FOR SHARE", buyer)
      .AsSingleRow<Policy>(pg::kRowTag);
}

void Record(pg::Transaction& tx, const std::string& buyer, const std::string& product,
            std::int64_t quantity, const std::string& unit_price, const std::string& total,
            const std::string& receiver, const std::string& decision, const std::string& reason) {
  tx.Execute("INSERT INTO policy_decisions (buyer_id, product_id, quantity, unit_price_yocto, "
             "total_yocto, receiver_id, decision, reason) VALUES "
             "($1, $2, $3, $4::text::numeric, $5::text::numeric, NULLIF($6, ''), $7, $8)",
             buyer, product, quantity, unit_price, total, receiver, decision, reason);
}

std::vector<Decision> Recent(const pg::ClusterPtr& cluster, const std::string& buyer) {
  return cluster->Execute(pg::ClusterHostType::kMaster,
      "SELECT product_id, total_yocto::text, decision, reason FROM policy_decisions "
      "WHERE buyer_id = $1 ORDER BY id DESC LIMIT 20", buyer)
      .AsContainer<std::vector<Decision>>(pg::kRowTag);
}

}  // namespace community_treasury::policies_repository
