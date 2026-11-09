import { describe, expect, test } from "vitest"
import {
  platformCredentialAad,
  userCredentialAad,
} from "../src/partials/credential"

// Stored ciphertext is bound to these exact strings. Changing them makes every
// existing credential undecryptable.
describe("credential AAD format", () => {
  test("user AAD keeps the legacy ':false' suffix", () => {
    expect(userCredentialAad("123", "stripe")).toBe("user:123:stripe:false")
  })

  test("platform AAD keeps the legacy ':false' suffix", () => {
    expect(platformCredentialAad("whatsapp")).toBe("platform:whatsapp:false")
  })
})
