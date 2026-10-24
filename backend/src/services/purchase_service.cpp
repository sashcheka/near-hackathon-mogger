#include "purchase_service.hpp"

#include <utility>

#include "../repositories/products_repository.hpp"

namespace community_treasury {

PurchaseService::PurchaseService(
    userver::storages::postgres::ClusterPtr cluster, const OllamaClient& model)
    : cluster_(std::move(cluster)), model_(model), orders_(cluster_) {}

Order PurchaseService::Create(const std::string& prompt,
                              const std::string& budget) const {
  if (prompt.empty() || prompt.size() > 2000 ||
      prompt.find_first_not_of(" \t\r\n") == std::string::npos)
    throw OrderError(OrderErrorCode::kInvalidRequest);
  ValidateBudget(budget);
  const auto products = products_repository::List(cluster_);
  // No database transaction or connection is held during model inference.
  const auto selection = model_.Select(prompt, products);
  return orders_.Create({selection.product_id, selection.quantity, budget});
}

}  // namespace community_treasury
