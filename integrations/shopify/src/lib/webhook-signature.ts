/**
 * Checks Shopify's `X-Shopify-Hmac-Sha256` header: the base64 HMAC-SHA256 of
 * the raw body, keyed with the app's secret. Web Crypto only, so this module
 * stays safe for the Edge bundle the builder's router reaches.
 */
export async function verifyShopifyWebhookSignature(input: {
  rawBody: string
  signature: string | null
  secret: string
}): Promise<boolean> {
  if (!input.signature) {
    return false
  }
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(input.rawBody)),
  )
  const expected = encoder.encode(btoa(String.fromCharCode(...digest)))
  const received = encoder.encode(input.signature.trim())
  return timingSafeEqual(expected, received)
}

const timingSafeEqual = (left: Uint8Array, right: Uint8Array) => {
  // Compare every byte of the longer input, so the time taken does not
  // reveal where the first difference is.
  const length = Math.max(left.length, right.length)
  // biome-ignore lint/suspicious/noBitwiseOperators: constant-time compare requires XOR/OR to avoid branching on byte equality
  let difference = left.length ^ right.length
  for (let index = 0; index < length; index++) {
    // biome-ignore lint/suspicious/noBitwiseOperators: constant-time compare requires XOR/OR to avoid branching on byte equality
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return difference === 0
}
