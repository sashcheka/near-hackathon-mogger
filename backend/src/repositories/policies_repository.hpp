#pragma once

#include <cstdint>
#include <string>
#include <vector>
#include <userver/storages/postgres/postgres_fwd.hpp>

namespace community_treasury::policies_repository {

struct Policy {
  std::string max_order;
  std::string max_unit;
  std::string merchant;
};

struct Decision {
  std::string product_id;
  std::string total;
  std::string decision;
  std::string reason;
};

Policy Get(const userver::storages::postgres::ClusterPtr& cluster, const std::string& buyer);
void Save(const userver::storages::postgres::ClusterPtr& cluster,
          const std::string& buyer, const Policy& policy);
Policy Lock(userver::storages::postgres::Transaction& tx, const std::string& buyer);
void Record(userver::storages::postgres::Transaction& tx, const std::string& buyer,
            const std::string& product, std::int64_t quantity, const std::string& unit_price,
            const std::string& total, const std::string& receiver,
            const std::string& decision, const std::string& reason);
std::vector<Decision> Recent(const userver::storages::postgres::ClusterPtr& cluster,
                             const std::string& buyer);

}  // namespace community_treasury::policies_repository
