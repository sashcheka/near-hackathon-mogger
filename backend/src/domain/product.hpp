#pragma once

#include <string>

namespace community_treasury {

struct Product {
  std::string id;
  std::string name;
  std::string price_yocto;
};

}  // namespace community_treasury
