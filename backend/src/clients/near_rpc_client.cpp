#include "near_rpc_client.hpp"

#include <userver/clients/http/error.hpp>
#include <userver/clients/http/response.hpp>
#include <utility>

#include "../domain/near_account.hpp"

namespace community_treasury {
namespace json = userver::formats::json;
namespace {
using Code = NearRpcErrorCode;

void Require(bool condition, Code code = Code::kInvalidResponse) {
  if (!condition) throw NearRpcError(code);
}

void CheckSuccess(const json::Value& status) {
  Require(status.IsObject());
  if (status.HasMember("Failure")) throw NearRpcError(Code::kFailed);
  Require(status.GetSize() == 1 && status["SuccessValue"].IsString());
}
}  // namespace

NearRpcClient::NearRpcClient(userver::clients::http::Client& http,
                             std::string url)
    : http_(http), url_(std::move(url)) {}

json::Value NearRpcClient::Call(std::string_view method,
                                const json::Value& params) const {
  try {
    const auto response =
        http_.CreateRequest()
            .post(url_, json::ToString(json::MakeObject(
                            "jsonrpc", "2.0", "id", "payment-verification",
                            "method", method, "params", params)))
            .headers({{"Content-Type", "application/json"}})
            .timeout(15000)
            .retry(1)
            .follow_redirects(false)
            .perform();
    if (!response->IsOk()) throw NearRpcError(Code::kUnavailable);
    const auto body = json::FromString(response->body_view());
    Require(body["jsonrpc"].As<std::string>() == "2.0" &&
            body["id"].As<std::string>() == "payment-verification");
    Require(body.HasMember("result") != body.HasMember("error"));
    if (body.HasMember("error")) {
      const auto error = body["error"];
      const auto code = error["code"].As<int>();
      const auto name = error.HasMember("cause")
                            ? error["cause"]["name"].As<std::string>()
                            : std::string{};
      if (code == -32602) throw NearRpcError(Code::kInvalidRequest);
      if (name == "UNKNOWN_TRANSACTION") throw NearRpcError(Code::kNotFound);
      if (name == "TIMEOUT_ERROR") throw NearRpcError(Code::kPending);
      if (name == "INVALID_TRANSACTION") throw NearRpcError(Code::kFailed);
      throw NearRpcError(Code::kUnavailable);
    }
    Require(body["result"].IsObject());
    return body["result"];
  } catch (const userver::clients::http::TimeoutException&) {
    throw NearRpcError(Code::kTimeout);
  } catch (const userver::clients::http::BaseException&) {
    throw NearRpcError(Code::kUnavailable);
  } catch (const json::Exception&) {
    throw NearRpcError(Code::kInvalidResponse);
  }
}

void NearRpcClient::VerifyTransfer(const std::string& hash,
                                   const std::string& sender,
                                   const std::string& receiver,
                                   const std::string& amount) const {
  constexpr std::string_view alphabet =
      "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  Require(hash.size() >= 32 && hash.size() <= 44 &&
              hash.find_first_not_of(alphabet) == std::string::npos &&
              IsValidNearAccountId(sender) && IsValidNearAccountId(receiver),
          Code::kInvalidRequest);
  try {
    Require(Call("status", json::MakeArray())["chain_id"].As<std::string>() ==
                "testnet",
            Code::kWrongNetwork);
    const auto result =
        Call("tx", json::MakeObject("tx_hash", hash, "sender_account_id",
                                    sender, "wait_until", "FINAL"));
    const auto finality = result["final_execution_status"].As<std::string>();
    if (finality == "NONE" || finality == "INCLUDED" ||
        finality == "EXECUTED_OPTIMISTIC" || finality == "INCLUDED_FINAL" ||
        finality == "EXECUTED")
      throw NearRpcError(Code::kPending);
    Require(finality == "FINAL");
    CheckSuccess(result["status"]);
    const auto tx = result["transaction"];
    Require(tx["hash"].As<std::string>() == hash &&
                tx["signer_id"].As<std::string>() == sender &&
                tx["receiver_id"].As<std::string>() == receiver,
            Code::kMismatch);
    const auto actions = tx["actions"];
    Require(actions.IsArray() && actions.GetSize() == 1 &&
                actions[0].IsObject() && actions[0].GetSize() == 1 &&
                actions[0].HasMember("Transfer"),
            Code::kMismatch);
    const auto transfer = actions[0]["Transfer"];
    Require(transfer.IsObject() && transfer.GetSize() == 1);
    Require(transfer["deposit"].As<std::string>() == amount, Code::kMismatch);
    Require(result["transaction_outcome"]["id"].As<std::string>() == hash);
    const auto receipt_id =
        result["transaction_outcome"]["outcome"]["status"]["SuccessReceiptId"]
            .As<std::string>();
    Require(!receipt_id.empty() && result["receipts_outcome"].IsArray());
    std::size_t matches = 0;
    for (const auto& receipt : result["receipts_outcome"]) {
      if (receipt["id"].As<std::string>() != receipt_id) continue;
      ++matches;
      Require(receipt["outcome"]["executor_id"].As<std::string>() == receiver);
      CheckSuccess(receipt["outcome"]["status"]);
    }
    Require(matches == 1);
  } catch (const json::Exception&) {
    throw NearRpcError(Code::kInvalidResponse);
  }
}

}  // namespace community_treasury
