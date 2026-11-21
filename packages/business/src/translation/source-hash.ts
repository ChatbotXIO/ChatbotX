import { sha256Hex } from "@chatbotx.io/utils/crypto"

const TRAILING_PADDING = /=+$/u

/**
 * `MessageTranslation.sourceHash`: SHA-256 of the message text cut to 128 bits
 * and written as 22 base64url characters. Compared to detect that a customer
 * edited a message while a translation job was running.
 */
export async function hashSourceText(text: string): Promise<string> {
  const hex = await sha256Hex(text)
  const bytes = Uint8Array.from(hex.slice(0, 32).match(/../g) ?? [], (pair) =>
    Number.parseInt(pair, 16),
  )
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(TRAILING_PADDING, "")
}
