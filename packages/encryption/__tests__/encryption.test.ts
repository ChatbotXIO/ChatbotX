import { describe, expect, test } from "vitest"
import { z } from "zod"
import { type EncryptedData, encryptUtils } from "../src/encryption"

const IV_HEX_RE = /^[0-9a-f]{24}$/
const TAG_HEX_RE = /^[0-9a-f]{32}$/
const UNSUPPORTED_VERSION_RE = /Unsupported encryption version/

describe("encryptUtils", () => {
  describe("text round-trip", () => {
    test("decrypts what was encrypted", async () => {
      const plaintext = "hunter2 — special chars: 你好 🚀"
      const blob = await encryptUtils.encryptText(plaintext)
      expect(await encryptUtils.decryptText(blob)).toBe(plaintext)
    })

    test("produces a versioned blob with iv, text, tag", async () => {
      const blob = await encryptUtils.encryptText("abc")
      expect(blob.v).toBe(1)
      expect(blob.iv).toMatch(IV_HEX_RE) // 12 bytes = 24 hex chars
      expect(blob.tag).toMatch(TAG_HEX_RE) // 16 bytes = 32 hex chars
      expect(blob.text.length).toBeGreaterThan(0)
    })

    test("two encryptions of same plaintext yield different ciphertexts", async () => {
      const a = await encryptUtils.encryptText("same")
      const b = await encryptUtils.encryptText("same")
      expect(a.iv).not.toBe(b.iv)
      expect(a.text).not.toBe(b.text)
    })
  })

  describe("tamper detection", () => {
    test("flipping a byte in ciphertext throws", async () => {
      const blob = await encryptUtils.encryptText("attack at dawn")
      const flipped: EncryptedData = {
        ...blob,
        text: flipFirstHexNibble(blob.text),
      }
      await expect(encryptUtils.decryptText(flipped)).rejects.toThrow()
    })

    test("flipping a byte in the auth tag throws", async () => {
      const blob = await encryptUtils.encryptText("attack at dawn")
      const flipped: EncryptedData = {
        ...blob,
        tag: flipFirstHexNibble(blob.tag),
      }
      await expect(encryptUtils.decryptText(flipped)).rejects.toThrow()
    })

    test("flipping a byte in the IV throws", async () => {
      const blob = await encryptUtils.encryptText("attack at dawn")
      const flipped: EncryptedData = {
        ...blob,
        iv: flipFirstHexNibble(blob.iv),
      }
      await expect(encryptUtils.decryptText(flipped)).rejects.toThrow()
    })
  })

  describe("version handling", () => {
    test("unknown version is rejected", async () => {
      const blob = await encryptUtils.encryptText("hi")
      const bogus = { ...blob, v: 999 as unknown as 1 }
      await expect(encryptUtils.decryptText(bogus)).rejects.toThrow(
        UNSUPPORTED_VERSION_RE,
      )
    })
  })

  describe("aad binding", () => {
    test("encrypts and decrypts with matching aad", async () => {
      const blob = await encryptUtils.encryptText("secret", "org:1:whatsapp")
      expect(await encryptUtils.decryptText(blob, "org:1:whatsapp")).toBe(
        "secret",
      )
    })

    test("decrypting with wrong aad throws", async () => {
      const blob = await encryptUtils.encryptText("secret", "org:1:whatsapp")
      await expect(
        encryptUtils.decryptText(blob, "org:2:whatsapp"),
      ).rejects.toThrow()
    })

    test("decrypting without aad throws when aad was used at encryption", async () => {
      const blob = await encryptUtils.encryptText("secret", "org:1:whatsapp")
      await expect(encryptUtils.decryptText(blob)).rejects.toThrow()
    })

    test("decrypting with aad throws when no aad was used at encryption", async () => {
      const blob = await encryptUtils.encryptText("secret")
      await expect(
        encryptUtils.decryptText(blob, "org:1:whatsapp"),
      ).rejects.toThrow()
    })

    test("encryptObject/decryptObject round-trip with matching aad", async () => {
      const original = { clientId: "app_123", clientSecret: "s3cr3t" }
      const schema = z.object({
        clientId: z.string(),
        clientSecret: z.string(),
      })
      const blob = await encryptUtils.encryptObject(original, "org:1:messenger")
      expect(
        await encryptUtils.decryptObject(blob, schema, "org:1:messenger"),
      ).toEqual(original)
    })

    test("decryptObject with wrong aad throws", async () => {
      const schema = z.object({
        clientId: z.string(),
        clientSecret: z.string(),
      })
      const blob = await encryptUtils.encryptObject(
        { clientId: "app_123", clientSecret: "s3cr3t" },
        "org:1:messenger",
      )
      await expect(
        encryptUtils.decryptObject(blob, schema, "org:9:messenger"),
      ).rejects.toThrow()
    })
  })

  describe("object round-trip", () => {
    const secretsSchema = z.object({
      apiKey: z.string(),
      verifyToken: z.string(),
    })

    test("decryptObject parses against schema", async () => {
      const original = { apiKey: "k_live_123", verifyToken: "vt-xyz" }
      const blob = await encryptUtils.encryptObject(original)
      const recovered = await encryptUtils.decryptObject(blob, secretsSchema)
      expect(recovered).toEqual(original)
    })

    test("decryptObject throws when the decrypted value does not match schema", async () => {
      const blob = await encryptUtils.encryptObject({ apiKey: 42 })
      await expect(
        encryptUtils.decryptObject(blob, secretsSchema),
      ).rejects.toThrow()
    })
  })
})

const FLIP_HEX_MAP: Record<string, string> = {
  "0": "f",
  "1": "e",
  "2": "d",
  "3": "c",
  "4": "b",
  "5": "a",
  "6": "9",
  "7": "8",
  "8": "7",
  "9": "6",
  a: "5",
  b: "4",
  c: "3",
  d: "2",
  e: "1",
  f: "0",
}

const flipFirstHexNibble = (hex: string): string => {
  const head = (hex[0] ?? "0").toLowerCase()
  const flipped = FLIP_HEX_MAP[head] ?? "0"
  return flipped + hex.slice(1)
}
