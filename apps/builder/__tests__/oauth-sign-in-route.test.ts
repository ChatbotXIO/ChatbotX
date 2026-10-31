import { beforeEach, describe, expect, test, vi } from "vitest"

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))

vi.mock("@/lib/auth/auth", () => ({ auth: { api: { getSession } } }))
vi.mock("@chatbotx.io/utils", () => ({
  getPublicOriginFromRequest: () => "https://app.example.com",
}))

const { GET } = await import("@/app/oauth/sign-in/route")

const call = (query: string) =>
  GET(new Request(`https://app.example.com/oauth/sign-in?${query}`))

describe("GET /oauth/sign-in", () => {
  beforeEach(() => {
    getSession.mockReset()
  })

  test("sends a signed-in user straight back to authorize", async () => {
    getSession.mockResolvedValue({ session: { id: "s1" } })

    const response = await call("client_id=c&sig=x")

    expect(response.headers.get("location")).toBe(
      "https://app.example.com/api/auth/oauth2/authorize?client_id=c&sig=x",
    )
  })

  test("shows the sign-in page when there is no session", async () => {
    getSession.mockResolvedValue(null)

    const response = await call("client_id=c&sig=x")

    expect(response.headers.get("location")).toBe(
      "https://app.example.com/auth/sign-in?client_id=c&sig=x",
    )
  })

  test.each([
    "prompt=login",
    "prompt=create",
    "prompt=consent+login",
    "max_age=0",
  ])("does not loop back to authorize when %s demands a fresh sign-in", async (query) => {
    getSession.mockResolvedValue({ session: { id: "s1" } })

    const response = await call(`client_id=c&${query}`)

    expect(response.headers.get("location")).toContain("/auth/sign-in?")
  })
})
