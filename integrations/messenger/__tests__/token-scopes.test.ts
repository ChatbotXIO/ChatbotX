import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ debugToken: vi.fn() }))

vi.mock("../src/apis/auth", () => ({ debugToken: mocks.debugToken }))

const { readTokenScopes } = await import("../src/apis/token-scopes")
const { MessengerAPIException } = await import("../src/exception")

const input = { appAccessToken: "app|secret", inputToken: "page-token" }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("readTokenScopes", () => {
  test("returns the scopes of a valid token", async () => {
    mocks.debugToken.mockResolvedValue({
      is_valid: true,
      scopes: ["pages_manage_posts", "pages_show_list"],
    })

    expect(await readTokenScopes(input)).toEqual({
      kind: "scopes",
      scopes: ["pages_manage_posts", "pages_show_list"],
    })
    expect(mocks.debugToken).toHaveBeenCalledWith(input)
  })

  test("an invalid token is reported, whatever scopes it lists", async () => {
    mocks.debugToken.mockResolvedValue({ is_valid: false, scopes: ["a"] })

    expect(await readTokenScopes(input)).toEqual({ kind: "invalidToken" })
  })

  test("an answer without scopes claims nothing", async () => {
    mocks.debugToken.mockResolvedValue({ is_valid: true })

    expect(await readTokenScopes(input)).toEqual({ kind: "unreported" })
  })

  test("a malformed scopes list claims nothing", async () => {
    mocks.debugToken.mockResolvedValue({ scopes: ["ok", 3] })

    expect(await readTokenScopes(input)).toEqual({ kind: "unreported" })
  })

  test("a rate-limit answer is its own result", async () => {
    mocks.debugToken.mockRejectedValue(
      new MessengerAPIException("limit", 400, 4),
    )

    expect(await readTokenScopes(input)).toEqual({ kind: "rateLimited" })
  })

  test("any other failure is `failed` and never throws", async () => {
    mocks.debugToken.mockRejectedValue(new Error("network"))

    expect(await readTokenScopes(input)).toEqual({ kind: "failed" })
  })
})
