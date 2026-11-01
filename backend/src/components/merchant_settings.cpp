#include "merchant_settings.hpp"

#include <stdexcept>
#include <userver/components/component_config.hpp>
#include <userver/yaml_config/merge_schemas.hpp>

#include "../domain/near_account.hpp"

namespace community_treasury {

MerchantSettings::MerchantSettings(
    const userver::components::ComponentConfig& config,
    const userver::components::ComponentContext& context)
    : ComponentBase(config, context),
      account_id_(config["account-id"].As<std::string>()) {
  if (!account_id_.empty() && !IsValidNearAccountId(account_id_)) {
    throw std::invalid_argument(
        "MERCHANT_ACCOUNT_ID has an invalid account format");
  }
}

userver::yaml_config::Schema MerchantSettings::GetStaticConfigSchema() {
  return userver::yaml_config::MergeSchemas<ComponentBase>(R"(
type: object
description: Merchant account for native NEAR Testnet transfers
additionalProperties: false
properties:
    account-id:
        type: string
        description: Merchant account ID, empty to create orders without payment details
)");
}

}  // namespace community_treasury
