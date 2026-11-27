import { describe, expect, test } from "vitest"
import { hexToBytes } from "../src/binary"
import { encryptUtils } from "../src/encryption"
import { isMalformedEncryptedData } from "../src/malformed"

describe("isMalformedEncryptedData", () => {
  test("an odd-length hex blob is malformed", () => {
    let thrown: unknown
    try {
      hexToBytes("abc")
    } catch (err) {
      thrown = err
    }
    expect(isMalformedEncryptedData(thrown)).toBe(true)
  })

  test("an even-length blob with non-hex characters is malformed", () => {
    let thrown: unknown
    try {
      hexToBytes("gg".repeat(12))
    } catch (err) {
      thrown = err
    }
    expect(isMalformedEncryptedData(thrown)).toBe(true)
    expect(hexToBytes("0aFf")).toEqual(new Uint8Array([10, 255]))
  })

  test("an unsupported version is malformed", async () => {
    const blob = await encryptUtils.encryptText("abc")
    const thrown = await encryptUtils
      .decryptText({ ...blob, v: 99 })
      .catch((err: unknown) => err)
    expect(isMalformedEncryptedData(thrown)).toBe(true)
  })

  test("other errors are not malformed data", () => {
    expect(isMalformedEncryptedData(new Error("no key available"))).toBe(false)
    expect(
      isMalformedEncryptedData(
        Object.assign(new Error("x"), { name: "OperationError" }),
      ),
    ).toBe(false)
  })
})
