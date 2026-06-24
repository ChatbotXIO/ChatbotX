/// <reference lib="dom" />

export async function sha256Hex(content: string): Promise<string> {
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(content))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  let different = 0
  for (let i = 0; i < a.length; i++) {
    different += a.charCodeAt(i) === b.charCodeAt(i) ? 0 : 1
  }
  return different === 0
}
