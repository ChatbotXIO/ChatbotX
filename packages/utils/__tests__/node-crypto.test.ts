import { createHmac } from "node:crypto"
import { describe, expect, test } from "vitest"
import { verifyHmacSha256Signature } from "../src/node-crypto"

const SECRET = "app-secret"

const sign = (rawBody: Uint8Array, secret: string = SECRET): string =>
  `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

describe("verifyHmacSha256Signature", () => {
  test("accepts a signature computed over the exact raw bytes", () => {
    const rawBody = bytes(JSON.stringify({ hello: "world" }))

    expect(
      verifyHmacSha256Signature({
        rawBody,
        secret: SECRET,
        signatureHeader: sign(rawBody),
      }),
    ).toBe(true)
  })

  test("accepts a valid signature over non-ASCII (Vietnamese) bytes", () => {
    const rawBody = bytes(
      JSON.stringify({ text: "Xin chào, tôi cần hỗ trợ đặt hàng." }),
    )

    expect(
      verifyHmacSha256Signature({
        rawBody,
        secret: SECRET,
        signatureHeader: sign(rawBody),
      }),
    ).toBe(true)
  })

  test("rejects when the body does not match the signature", () => {
    const signatureHeader = sign(bytes(JSON.stringify({ hello: "world" })))

    expect(
      verifyHmacSha256Signature({
        rawBody: bytes(JSON.stringify({ hello: "tampered" })),
        secret: SECRET,
        signatureHeader,
      }),
    ).toBe(false)
  })

  test("rejects a missing signature header", () => {
    expect(
      verifyHmacSha256Signature({
        rawBody: bytes("{}"),
        secret: SECRET,
        signatureHeader: undefined,
      }),
    ).toBe(false)
  })

  test("rejects a signature header with the wrong prefix", () => {
    const digest = sign(bytes("{}")).replace("sha256=", "")

    expect(
      verifyHmacSha256Signature({
        rawBody: bytes("{}"),
        secret: SECRET,
        signatureHeader: `sha1=${digest}`,
      }),
    ).toBe(false)
  })

  test("rejects a malformed (non-hex) signature hash", () => {
    expect(
      verifyHmacSha256Signature({
        rawBody: bytes("{}"),
        secret: SECRET,
        signatureHeader: "sha256=zz",
      }),
    ).toBe(false)
  })

  test("rejects a truncated (wrong-length) signature hash", () => {
    const digest = sign(bytes("{}")).replace("sha256=", "")

    expect(
      verifyHmacSha256Signature({
        rawBody: bytes("{}"),
        secret: SECRET,
        signatureHeader: `sha256=${digest.slice(0, 10)}`,
      }),
    ).toBe(false)
  })

  test("supports a custom prefix", () => {
    const rawBody = bytes("{}")
    const digest = sign(rawBody).replace("sha256=", "")

    expect(
      verifyHmacSha256Signature({
        rawBody,
        secret: SECRET,
        signatureHeader: `custom=${digest}`,
        prefix: "custom=",
      }),
    ).toBe(true)
  })
})
