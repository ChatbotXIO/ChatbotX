import { createHmac } from "node:crypto"
import { describe, expect, test } from "vitest"
import {
  hmacSha256Hex,
  timingSafeStringEqual,
  verifyHmacSha256Signature,
} from "../src/crypto"

const HEX_SHA256 = /^[0-9a-f]{64}$/

describe("hmacSha256Hex", () => {
  test("produces a stable lowercase hex digest for a given secret + payload", async () => {
    const first = await hmacSha256Hex("secret", "payload")
    const second = await hmacSha256Hex("secret", "payload")

    expect(first).toBe(second)
    expect(first).toMatch(HEX_SHA256)
  })

  test("changes when the secret changes", async () => {
    const a = await hmacSha256Hex("secret-a", "payload")
    const b = await hmacSha256Hex("secret-b", "payload")

    expect(a).not.toBe(b)
  })

  test("changes when the payload changes", async () => {
    const a = await hmacSha256Hex("secret", "payload-a")
    const b = await hmacSha256Hex("secret", "payload-b")

    expect(a).not.toBe(b)
  })
})

describe("timingSafeStringEqual", () => {
  test("returns true for identical strings", () => {
    expect(timingSafeStringEqual("abc123", "abc123")).toBe(true)
  })

  test("returns false for different strings of equal length", () => {
    expect(timingSafeStringEqual("abc123", "abc124")).toBe(false)
  })

  test("returns false for strings of different length", () => {
    expect(timingSafeStringEqual("abc", "abcd")).toBe(false)
  })
})

describe("verifyHmacSha256Signature", () => {
  const SECRET = "app-secret"
  const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)
  const sign = (rawBody: Uint8Array, secret: string = SECRET): string =>
    `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`

  test("accepts a signature computed over the exact raw bytes", async () => {
    const rawBody = bytes(JSON.stringify({ hello: "world" }))

    await expect(
      verifyHmacSha256Signature({
        rawBody,
        secret: SECRET,
        signatureHeader: sign(rawBody),
      }),
    ).resolves.toBe(true)
  })

  test("accepts a valid signature over non-ASCII (Vietnamese) bytes", async () => {
    const rawBody = bytes(
      JSON.stringify({ text: "Xin chào, tôi cần hỗ trợ đặt hàng." }),
    )

    await expect(
      verifyHmacSha256Signature({
        rawBody,
        secret: SECRET,
        signatureHeader: sign(rawBody),
      }),
    ).resolves.toBe(true)
  })

  test("rejects when the body does not match the signature", async () => {
    const signatureHeader = sign(bytes(JSON.stringify({ hello: "world" })))

    await expect(
      verifyHmacSha256Signature({
        rawBody: bytes(JSON.stringify({ hello: "tampered" })),
        secret: SECRET,
        signatureHeader,
      }),
    ).resolves.toBe(false)
  })

  test("rejects a missing signature header", async () => {
    await expect(
      verifyHmacSha256Signature({
        rawBody: bytes("{}"),
        secret: SECRET,
        signatureHeader: undefined,
      }),
    ).resolves.toBe(false)
  })

  test("rejects a signature header with the wrong prefix", async () => {
    const digest = sign(bytes("{}")).replace("sha256=", "")

    await expect(
      verifyHmacSha256Signature({
        rawBody: bytes("{}"),
        secret: SECRET,
        signatureHeader: `sha1=${digest}`,
      }),
    ).resolves.toBe(false)
  })

  test("rejects a malformed (non-hex) signature hash", async () => {
    await expect(
      verifyHmacSha256Signature({
        rawBody: bytes("{}"),
        secret: SECRET,
        signatureHeader: "sha256=zz",
      }),
    ).resolves.toBe(false)
  })

  test("rejects a truncated (wrong-length) signature hash", async () => {
    const digest = sign(bytes("{}")).replace("sha256=", "")

    await expect(
      verifyHmacSha256Signature({
        rawBody: bytes("{}"),
        secret: SECRET,
        signatureHeader: `sha256=${digest.slice(0, 10)}`,
      }),
    ).resolves.toBe(false)
  })

  test("supports a custom prefix", async () => {
    const rawBody = bytes("{}")
    const digest = sign(rawBody).replace("sha256=", "")

    await expect(
      verifyHmacSha256Signature({
        rawBody,
        secret: SECRET,
        signatureHeader: `custom=${digest}`,
        prefix: "custom=",
      }),
    ).resolves.toBe(true)
  })
})
