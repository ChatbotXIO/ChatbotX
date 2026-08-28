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
    // decryptText/decryptObject take no aad parameter: the aad a caller
    // stamped at encrypt time travels with the blob and is read back
    // automatically, so any holder of the blob can decrypt it without
    // reconstructing the writer's context.
    test("decrypts a blob that carries an aad without any caller input", async () => {
      const blob = await encryptUtils.encryptText("secret", "org:1:whatsapp")
      expect(blob.aad).toBe("org:1:whatsapp")
      expect(await encryptUtils.decryptText(blob)).toBe("secret")
    })

    test("decrypts a blob with no aad the same way", async () => {
      const blob = await encryptUtils.encryptText("secret")
      expect(blob.aad).toBeUndefined()
      expect(await encryptUtils.decryptText(blob)).toBe("secret")
    })

    // The aad is still authenticated by the GCM tag, not merely echoed back:
    // rewriting it after the fact must invalidate decryption. This is the
    // guarantee that remains once decrypt stops taking a caller-supplied aad.
    test("tampering with the stored aad throws", async () => {
      const blob = await encryptUtils.encryptText("secret", "org:1:whatsapp")
      const tampered: EncryptedData = { ...blob, aad: "org:2:whatsapp" }
      await expect(encryptUtils.decryptText(tampered)).rejects.toThrow()
    })

    test("encryptObject/decryptObject round-trip with an aad-carrying blob", async () => {
      const original = { clientId: "app_123", clientSecret: "s3cr3t" }
      const schema = z.object({
        clientId: z.string(),
        clientSecret: z.string(),
      })
      const blob = await encryptUtils.encryptObject(original, "org:1:messenger")
      expect(await encryptUtils.decryptObject(blob, schema)).toEqual(original)
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
