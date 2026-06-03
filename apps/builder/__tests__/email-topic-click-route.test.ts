// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest"

const recordClick = vi.fn().mockResolvedValue(undefined)

vi.mock("@chatbotx.io/analytics", () => ({
  emailTopicAnalyticsService: { recordClick },
}))

afterEach(() => {
  vi.clearAllMocks()
})

const { GET } = await import("../src/app/email-topic/click/route")

test("redirects to the url param with 302", async () => {
  const req = new Request(
    "http://localhost/email-topic/click?r=tok&url=https%3A%2F%2Fexample.com%2Fpath",
  )
  const res = await GET(req)
  expect(res.status).toBe(302)
  expect(res.headers.get("location")).toBe("https://example.com/path")
})

test("redirects to request url when url param is missing", async () => {
  const req = new Request("http://localhost/email-topic/click?r=tok")
  const res = await GET(req)
  expect(res.status).toBe(302)
})

test("calls recordClick with the token from ?r param", async () => {
  const req = new Request(
    "http://localhost/email-topic/click?r=tok-123&url=https%3A%2F%2Fexample.com",
  )
  await GET(req)
  expect(recordClick).toHaveBeenCalledOnce()
  expect(recordClick).toHaveBeenCalledWith("tok-123")
})

test("does not call recordClick when r param is missing", async () => {
  const req = new Request(
    "http://localhost/email-topic/click?url=https%3A%2F%2Fexample.com",
  )
  await GET(req)
  expect(recordClick).not.toHaveBeenCalled()
})
