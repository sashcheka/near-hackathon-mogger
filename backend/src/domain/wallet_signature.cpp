#include "wallet_signature.hpp"

#include <openssl/evp.h>

#include <array>
#include <cstdint>
#include <memory>
#include <string>
#include <userver/crypto/base64.hpp>
#include <userver/crypto/hash.hpp>

namespace community_treasury {
namespace {
namespace base64 = userver::crypto::base64;

bool DecodeKey(std::string_view key, std::array<unsigned char, 32> &bytes) {
  constexpr std::string_view alphabet =
      "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  if (!key.starts_with("ed25519:")) return false;
  key.remove_prefix(8);
  if (key.size() < 32 || key.size() > 44) return false;
  for (const char c : key) {
    const auto digit = alphabet.find(c);
    if (digit == std::string_view::npos) return false;
    unsigned carry = digit;
    for (auto it = bytes.rbegin(); it != bytes.rend(); ++it) {
      carry += *it * 58;
      *it = carry & 255;
      carry >>= 8;
    }
    if (carry) return false;
  }
  std::size_t zeros = 0;
  while (zeros < bytes.size() && bytes[zeros] == 0) ++zeros;
  const auto leading = key.find_first_not_of('1');
  return (leading == std::string_view::npos ? key.size() : leading) == zeros;
}

void AppendU32(std::string &bytes, std::uint32_t value) {
  for (int i = 0; i < 4; ++i) bytes.push_back((value >> (i * 8)) & 255);
}

void AppendString(std::string &bytes, std::string_view value) {
  AppendU32(bytes, value.size());
  bytes.append(value);
}
}  // namespace

bool VerifyWalletSignature(std::string_view message, std::string_view nonce,
                           std::string_view recipient,
                           std::string_view public_key,
                           std::string_view signature) {
  std::array<unsigned char, 32> key_bytes{};
  if (!DecodeKey(public_key, key_bytes) || nonce.size() != 44 ||
      signature.size() != 88)
    return false;
  // Round trips reject invalid characters, padding and noncanonical encodings.
  std::string raw_nonce(nonce), raw_signature(signature);
  if (!base64::Base64UniversalDecodeInPlace(raw_nonce) ||
      !base64::Base64UniversalDecodeInPlace(raw_signature) ||
      raw_nonce.size() != 32 || raw_signature.size() != 64 ||
      base64::Base64Encode(raw_nonce) != nonce ||
      base64::Base64Encode(raw_signature) != signature)
    return false;
  std::string bytes;
  AppendU32(bytes, 2147484061U);
  AppendString(bytes, message);
  bytes.append(raw_nonce);
  AppendString(bytes, recipient);
  bytes.push_back(0);  // Borsh Option::None for callbackUrl.
  const auto hash = userver::crypto::hash::Sha256(
      bytes, userver::crypto::hash::OutputEncoding::kBinary);
  const std::unique_ptr<EVP_PKEY, decltype(&EVP_PKEY_free)> key(
      EVP_PKEY_new_raw_public_key(EVP_PKEY_ED25519, nullptr, key_bytes.data(),
                                  key_bytes.size()),
      EVP_PKEY_free);
  const std::unique_ptr<EVP_MD_CTX, decltype(&EVP_MD_CTX_free)> context(
      EVP_MD_CTX_new(), EVP_MD_CTX_free);
  return key && context &&
         EVP_DigestVerifyInit(context.get(), nullptr, nullptr, nullptr,
                              key.get()) == 1 &&
         EVP_DigestVerify(
             context.get(),
             reinterpret_cast<const unsigned char *>(raw_signature.data()),
             raw_signature.size(),
             reinterpret_cast<const unsigned char *>(hash.data()),
             hash.size()) == 1;
}

}  // namespace community_treasury
