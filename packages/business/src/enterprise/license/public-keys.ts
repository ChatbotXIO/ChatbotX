export const LICENSE_ISSUER = "https://chatbotx.io/licenses"

/**
 * Map of `kid` (key id, from the JWS header) -> SPKI PEM public key.
 *
 * These are **public** verification keys and are safe to commit — they can only
 * verify a signature, never sign or forge one. The matching **private** signing
 * key and the license-signing tooling live in the private `../aha.chat-enterprise`
 * repo and are never shipped here (GitLab-EE model: public key in source,
 * fully offline verification, no phone-home).
 *
 * Multiple entries allow key rotation: an old license keeps verifying under its
 * original `kid` while new licenses are signed with a fresh one.
 *
 * NOTE: `LICENSE_ISSUER` must match the `iss` claim set by the signer in
 * `../aha.chat-enterprise`, or every token fails verification.
 *
 * TODO(enterprise): replace the placeholder key below with the real public key
 * generated in `../aha.chat-enterprise`. Until then no production license
 * verifies offline.
 */
export type LicensePublicKeys = Record<string, string>

export const LICENSE_PUBLIC_KEYS: LicensePublicKeys = {
  "chatbotx-license-ed25519-2026-01": [
    "-----BEGIN PUBLIC KEY-----",
    "MCowBQYDK2VwAyEAaTaaNoUri+gM5SRYbo5xRy/pjaA/jF0w9DhS0AttbH0=",
    "-----END PUBLIC KEY-----",
  ].join("\n"),
}
