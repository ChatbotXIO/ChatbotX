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
 */
export type LicensePublicKeys = Record<string, string>

export const LICENSE_PUBLIC_KEYS: LicensePublicKeys = {
  "chatbotx-license-ed25519-2026-08": [
    "-----BEGIN PUBLIC KEY-----",
    "MCowBQYDK2VwAyEAo+li4bBUyYNnGoOrXm2NLHrUP14S4MTH3lw4Z6C8pl4=",
    "-----END PUBLIC KEY-----",
  ].join("\n"),
  // Dev/test signing key — the matching private key is shared inside the
  // private enterprise repo so developers can mint local licenses.
  "chatbotx-license-ed25519-dev": [
    "-----BEGIN PUBLIC KEY-----",
    "MCowBQYDK2VwAyEAO5V5i1yZkhjX6pdurY1+S1WPOb7lGVYzxndIfsBSkvk=",
    "-----END PUBLIC KEY-----",
  ].join("\n"),
}
