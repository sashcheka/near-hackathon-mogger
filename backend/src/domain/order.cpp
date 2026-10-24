#include "order.hpp"

#include <algorithm>

namespace community_treasury {

void ValidateBudget(std::string_view budget) {
  if (budget.empty() || budget.size() > 39 || budget.front() == '0' ||
      !std::all_of(budget.begin(), budget.end(),
                   [](char c) { return c >= '0' && c <= '9'; })) {
    throw OrderError(OrderErrorCode::kInvalidRequest);
  }
}

}  // namespace community_treasury
