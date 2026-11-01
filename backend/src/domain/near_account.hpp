#pragma once

#include <regex>
#include <string_view>

namespace community_treasury {

inline bool IsValidNearAccountId(std::string_view account) {
  static const std::regex pattern("[a-z0-9]+([._-][a-z0-9]+)*");
  return account.size() >= 2 && account.size() <= 64 && account != "system" &&
         std::regex_match(account.begin(), account.end(), pattern);
}

}  // namespace community_treasury
