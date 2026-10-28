#pragma once

#include <string>
#include <string_view>
#include <userver/components/component_base.hpp>

namespace community_treasury {

class MerchantSettings final : public userver::components::ComponentBase {
 public:
  static constexpr std::string_view kName = "merchant-settings";
  MerchantSettings(const userver::components::ComponentConfig& config,
                   const userver::components::ComponentContext& context);
  static userver::yaml_config::Schema GetStaticConfigSchema();
  const std::string& AccountId() const { return account_id_; }

 private:
  const std::string account_id_;
};

}  // namespace community_treasury
