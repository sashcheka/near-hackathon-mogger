#pragma once

#include <string>

namespace community_treasury {

struct Product {
  std::string id;
  std::string name;
  std::string price_yocto;
  std::string merchant_id;
  std::string merchant_name;
};

}  // namespace community_treasury
