import { afterEach, describe, expect, test, vi } from "vitest"

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const { generateRandomUuid } = await import("@/lib/generate-random-uuid")

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("generateRandomUuid", () => {
  test("uses crypto.randomUUID when available in a secure context", () => {
    const spy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("11111111-1111-4111-8111-111111111111" as never)

    expect(generateRandomUuid()).toBe("11111111-1111-4111-8111-111111111111")
    expect(spy).toHaveBeenCalledTimes(1)
  })

  test("falls back to crypto.getRandomValues when randomUUID is unavailable (insecure context)", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (arr: Uint8Array) => {
        arr.fill(0xab)
        return arr
      },
    })

    const id = generateRandomUuid()
    expect(id).toMatch(UUID_REGEX)
  })

  test("falls back to crypto.getRandomValues when randomUUID throws (insecure context)", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => {
        throw new DOMException("insecure context", "NotSupportedError")
      },
      getRandomValues: (arr: Uint8Array) => {
        arr.fill(0xcd)
        return arr
      },
    })

    const id = generateRandomUuid()
    expect(id).toMatch(UUID_REGEX)
  })

  test("falls back to Math.random when the Web Crypto API is entirely unavailable", () => {
    vi.stubGlobal("crypto", undefined)

    const id = generateRandomUuid()
    expect(id).toMatch(UUID_REGEX)
  })

  test("every generated id is unique across many calls", () => {
    vi.stubGlobal("crypto", undefined)

    const ids = new Set(Array.from({ length: 50 }, () => generateRandomUuid()))
    expect(ids.size).toBe(50)
  })
})
