#pragma once

#include <regex>
#include <string_view>

namespace community_treasury {

inline bool IsValidNearAccountId(std::string_view account) {
  static const std::regex pattern("[a-z0-9]+([._-][a-z0-9]+)*");
  return account.size() >= 2 && account.size() <= 64 && account != "system" &&
         std::regex_match(account.begin(), account.end(), pattern);
}

inline bool IsValidNearHash(std::string_view hash) {
  constexpr std::string_view alphabet =
      "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  return hash.size() >= 32 && hash.size() <= 44 &&
         hash.find_first_not_of(alphabet) == std::string_view::npos;
}

}  // namespace community_treasury
