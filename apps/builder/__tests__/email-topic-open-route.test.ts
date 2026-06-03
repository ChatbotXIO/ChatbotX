// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest"

const recordOpen = vi.fn().mockResolvedValue(undefined)

vi.mock("@chatbotx.io/analytics", () => ({
  emailTopicAnalyticsService: { recordOpen },
}))

afterEach(() => {
  vi.clearAllMocks()
})

const { GET } = await import("../src/app/email-topic/open/route")

test("returns 1×1 GIF with no-cache headers", async () => {
  const req = new Request("http://localhost/email-topic/open")
  const res = await GET(req)
  expect(res.headers.get("Content-Type")).toBe("image/gif")
  expect(res.headers.get("Cache-Control")).toContain("no-store")
})

test("calls recordOpen with the token from ?r param", async () => {
  const req = new Request("http://localhost/email-topic/open?r=test-token-abc")
  await GET(req)
  expect(recordOpen).toHaveBeenCalledOnce()
  expect(recordOpen).toHaveBeenCalledWith("test-token-abc")
})

test("does not call recordOpen when r param is missing", async () => {
  const req = new Request("http://localhost/email-topic/open")
  await GET(req)
  expect(recordOpen).not.toHaveBeenCalled()
})
