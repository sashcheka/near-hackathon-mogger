#pragma once

#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>

#include <userver/clients/http/client.hpp>

#include "../domain/product.hpp"

namespace community_treasury {

struct ProductSelection {
  std::string product_id;
  std::int64_t quantity;
};

enum class ModelErrorCode {
  kUnavailable,
  kTimeout,
  kInvalidResponse,
  kNoMatch
};

class ModelError final : public std::runtime_error {
 public:
  explicit ModelError(ModelErrorCode code)
      : std::runtime_error("Model selection failed"), code(code) {}
  const ModelErrorCode code;
};

class OllamaClient {
 public:
  OllamaClient(userver::clients::http::Client& http, std::string url,
               std::string model);
  ProductSelection Select(const std::string& prompt,
                          const std::vector<Product>& products) const;

 private:
  userver::clients::http::Client& http_;
  const std::string url_;
  const std::string model_;
};

}  // namespace community_treasury
