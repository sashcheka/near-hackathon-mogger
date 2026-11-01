#pragma once

#include <stdexcept>
#include <string>
#include <string_view>
#include <userver/clients/http/client.hpp>
#include <userver/formats/json.hpp>

namespace community_treasury {

enum class NearRpcErrorCode {
  kInvalidRequest,
  kUnavailable,
  kTimeout,
  kInvalidResponse,
  kWrongNetwork,
  kPending,
  kNotFound,
  kFailed,
  kMismatch
};

class NearRpcError final : public std::runtime_error {
 public:
  explicit NearRpcError(NearRpcErrorCode code)
      : std::runtime_error("NEAR transfer verification failed"), code(code) {}
  const NearRpcErrorCode code;
};

class NearRpcClient {
 public:
  NearRpcClient(userver::clients::http::Client& http, std::string url);
  void VerifyTransfer(const std::string& hash, const std::string& sender,
                      const std::string& receiver,
                      const std::string& amount) const;

 private:
  userver::formats::json::Value Call(
      std::string_view method,
      const userver::formats::json::Value& params) const;
  userver::clients::http::Client& http_;
  const std::string url_;
};

}  // namespace community_treasury
