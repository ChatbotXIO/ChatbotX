import { describe, expect, test } from "vitest"
import { capText, DEFAULT_MAX_LOG_CHARS, redactSecrets } from "../src/redact"

describe("redactSecrets", () => {
  test("redacts top-level sensitive keys and keeps ordinary ones", () => {
    const result = redactSecrets({
      access_token: "abc",
      apiKey: "xyz",
      api_key: "xyz",
      verify_token: "vt",
      password: "hunter2",
      signature: "sig",
      userId: "keep-me",
    }) as Record<string, unknown>

    expect(result.access_token).toBe("[redacted]")
    expect(result.apiKey).toBe("[redacted]")
    expect(result.api_key).toBe("[redacted]")
    expect(result.verify_token).toBe("[redacted]")
    expect(result.password).toBe("[redacted]")
    expect(result.signature).toBe("[redacted]")
    expect(result.userId).toBe("keep-me")
  })

  test("does not redact ordinary keys such as tokenCount (exact-match guard)", () => {
    const result = redactSecrets({ tokenCount: 42 }) as Record<string, unknown>

    expect(result.tokenCount).toBe(42)
  })

  test("redacts sensitive keys nested in objects and arrays", () => {
    const result = redactSecrets({
      user: { name: "alice", token: "secret-token" },
      entries: [{ client_secret: "s1", value: 1 }],
    }) as {
      user: { name: string; token: string }
      entries: Array<{ client_secret: string; value: number }>
    }

    expect(result.user.token).toBe("[redacted]")
    expect(result.user.name).toBe("alice")
    expect(result.entries[0].client_secret).toBe("[redacted]")
    expect(result.entries[0].value).toBe(1)
  })

  test("passes primitives through untouched", () => {
    expect(redactSecrets(42)).toBe(42)
    expect(redactSecrets("hello")).toBe("hello")
    expect(redactSecrets(null)).toBe(null)
    expect(redactSecrets(true)).toBe(true)
  })

  test("does not mutate the input", () => {
    const input = { token: "secret", nested: { password: "p" } }
    redactSecrets(input)

    expect(input.token).toBe("secret")
    expect(input.nested.password).toBe("p")
  })

  test("drops subtrees deeper than the depth limit without throwing", () => {
    let nested: unknown = { token: "deep-secret" }
    for (let i = 0; i < 200; i++) {
      nested = { child: nested }
    }

    let result: unknown
    expect(() => {
      result = redactSecrets(nested)
    }).not.toThrow()

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("deep-secret")
    expect(serialized).toContain("[omitted: too deeply nested]")
  })
})

describe("capText", () => {
  test("leaves text at or under the limit untouched", () => {
    expect(capText("hello", 10)).toBe("hello")
    expect(capText("a".repeat(10), 10)).toBe("a".repeat(10))
  })

  test("truncates and appends a marker when over the limit", () => {
    const result = capText("a".repeat(20), 10)

    expect(result.startsWith("a".repeat(10))).toBe(true)
    expect(result).toContain("…[truncated 10 chars]")
  })

  test("defaults to DEFAULT_MAX_LOG_CHARS", () => {
    const result = capText("a".repeat(DEFAULT_MAX_LOG_CHARS + 100))

    expect(result).toContain("…[truncated 100 chars]")
  })

  test("does not split a trailing surrogate pair", () => {
    // "😀" is a surrogate pair; place its high half on the cap boundary.
    const text = `${"a".repeat(9)}😀${"a".repeat(5)}`
    const result = capText(text, 10)
    const retained = result.slice(0, result.indexOf("…[truncated"))
    const lastCode = retained.charCodeAt(retained.length - 1)

    expect(lastCode >= 0xd8_00 && lastCode <= 0xdb_ff).toBe(false)
  })
})
