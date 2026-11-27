/**
 * Decode the JSON `state` an OAuth provider hands back to the integrations
 * callback.
 *
 * Integrations encode the state differently: most use `btoa` (standard
 * base64, alphabet `+` `/`), while TikTok uses `base64url` (alphabet `-` `_`).
 * `atob` rejects `-` and `_`, so it cannot be used here — Node's `base64url`
 * decoder accepts both alphabets, with or without padding.
 *
 * Throws when the decoded bytes are not valid JSON.
 */
export function decodeOAuthState(rawStateParam: string): unknown {
  const encodedState = decodeURIComponent(rawStateParam)
  const decodedJson = Buffer.from(encodedState, "base64url").toString("utf8")
  return JSON.parse(decodedJson)
}
