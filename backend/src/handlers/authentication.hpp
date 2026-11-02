#pragma once

#include <userver/crypto/hash.hpp>
#include <userver/server/http/http_request.hpp>

#include "../repositories/auth_repository.hpp"
#include "order_response.hpp"

namespace community_treasury {

inline std::string SessionHash(
    const userver::server::http::HttpRequest& request) {
  const auto& header = request.GetHeader("Authorization");
  constexpr std::string_view prefix = "Bearer ";
  if (!header.starts_with(prefix) || header.size() != prefix.size() + 44)
    throw AuthError(AuthErrorCode::kUnauthorized);
  return userver::crypto::hash::Sha256(header.substr(prefix.size()));
}

inline std::string AuthenticatedAccount(
    const userver::server::http::HttpRequest& request,
    const userver::storages::postgres::ClusterPtr& cluster) {
  const auto account =
      auth_repository::FindSession(cluster, SessionHash(request));
  if (!account) throw AuthError(AuthErrorCode::kUnauthorized);
  return *account;
}

inline std::string AuthErrorResponse(
    const userver::server::http::HttpRequest& request, AuthErrorCode code) {
  using Status = userver::server::http::HttpStatus;
  const auto error = code == AuthErrorCode::kInvalidRequest ? "invalid_request"
                     : code == AuthErrorCode::kInvalidChallenge
                         ? "invalid_challenge"
                         : "unauthorized";
  return JsonResponse(request,
                      code == AuthErrorCode::kInvalidRequest
                          ? Status::kBadRequest
                          : Status::kUnauthorized,
                      userver::formats::json::MakeObject("error", error));
}

}  // namespace community_treasury
