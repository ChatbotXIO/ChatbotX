const EXCHANGE_CODE_BYTES = 32
const BASE64_PADDING_PATTERN = /=+$/

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(BASE64_PADDING_PATTERN, "")

const sha256 = async (value: string): Promise<Uint8Array> =>
  new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  )

/** CSPRNG one-time code handed to the app in the social-login redirect. */
export const createExchangeCode = (): string =>
  toBase64Url(crypto.getRandomValues(new Uint8Array(EXCHANGE_CODE_BYTES)))

/** Only the hash of a code is stored, like every other bearer credential here. */
export const hashExchangeCode = async (code: string): Promise<string> =>
  toBase64Url(await sha256(code))

/** RFC 7636 `S256`: base64url(SHA-256(verifier)) must equal the stored challenge. */
export const verifyPkceChallenge = async (
  codeVerifier: string,
  codeChallenge: string,
): Promise<boolean> => {
  // Both sides are SHA-256 digests (the verifier itself never leaves the app),
  // so a plain comparison reveals nothing an attacker could use.
  return toBase64Url(await sha256(codeVerifier)) === codeChallenge
}
