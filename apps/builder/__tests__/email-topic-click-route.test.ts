// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest"

const recordClick = vi.fn().mockResolvedValue(undefined)
const verifyEmailClickToken = vi.fn()
const findAnalyticsWorkspaceIdByToken = vi.fn()
const loadServableWorkspace = vi.fn()

vi.mock("@chatbotx.io/analytics", () => ({
  emailTopicAnalyticsService: { recordClick },
}))

vi.mock("@chatbotx.io/business", () => ({
  emailTopicService: { findAnalyticsWorkspaceIdByToken },
  verifyEmailClickToken,
}))

vi.mock("@/lib/workspace/load-servable-workspace", () => ({
  loadServableWorkspace,
}))

beforeEach(() => {
  recordClick.mockReset()
  recordClick.mockResolvedValue(undefined)
  verifyEmailClickToken.mockReset()
  findAnalyticsWorkspaceIdByToken.mockReset()
  findAnalyticsWorkspaceIdByToken.mockResolvedValue(undefined)
  loadServableWorkspace.mockReset()
  loadServableWorkspace.mockResolvedValue({ servable: true })
})

const { GET } = await import("../src/app/email-topic/click/route")

test("redirects to the verified destination with 302", async () => {
  findAnalyticsWorkspaceIdByToken.mockResolvedValue(undefined)
  verifyEmailClickToken.mockResolvedValueOnce({
    url: "https://example.com/path",
    workspaceId: "workspace-1",
  })
  const req = new Request("http://localhost/email-topic/click?r=tok&u=signed")
  const res = await GET(req)
  expect(res.status).toBe(302)
  expect(res.headers.get("location")).toBe("https://example.com/path")
  expect(verifyEmailClickToken).toHaveBeenCalledWith("signed")
})

test("redirects to same-origin when the token is tampered or expired", async () => {
  findAnalyticsWorkspaceIdByToken.mockResolvedValue("workspace-1")
  verifyEmailClickToken.mockRejectedValueOnce(new Error("invalid token"))
  const req = new Request(
    "http://localhost/email-topic/click?r=tok&u=https%3A%2F%2Fevil.com",
  )
  const res = await GET(req)
  expect(res.status).toBe(302)
  // Open-redirect guard: never forwards to an attacker-supplied target.
  expect(res.headers.get("location")).toBe("http://localhost/")
  expect(recordClick).not.toHaveBeenCalled()
})

test("redirects to same-origin when the u param is missing", async () => {
  const req = new Request("http://localhost/email-topic/click?r=tok")
  const res = await GET(req)
  expect(res.status).toBe(302)
  expect(res.headers.get("location")).toBe("http://localhost/")
  expect(verifyEmailClickToken).not.toHaveBeenCalled()
})

test("calls recordClick with the token from ?r param", async () => {
  findAnalyticsWorkspaceIdByToken.mockResolvedValue("workspace-1")
  verifyEmailClickToken.mockResolvedValueOnce({
    url: "https://example.com",
    workspaceId: "workspace-1",
  })
  const req = new Request(
    "http://localhost/email-topic/click?r=tok-123&u=signed",
  )
  await GET(req)
  expect(recordClick).toHaveBeenCalledOnce()
  expect(recordClick).toHaveBeenCalledWith("tok-123")
  expect(loadServableWorkspace).toHaveBeenCalledWith("workspace-1")
})

test("returns 410 and skips click recording and redirect when the workspace is scheduled for deletion", async () => {
  findAnalyticsWorkspaceIdByToken.mockResolvedValue("workspace-1")
  loadServableWorkspace.mockResolvedValue({ servable: false })
  verifyEmailClickToken.mockResolvedValueOnce({
    url: "https://example.com",
    workspaceId: "workspace-1",
  })
  const req = new Request(
    "http://localhost/email-topic/click?r=tok-123&u=signed",
  )

  const res = await GET(req)

  expect(res.status).toBe(410)
  expect(recordClick).not.toHaveBeenCalled()
  expect(verifyEmailClickToken).not.toHaveBeenCalled()
})

test("does not call recordClick when r param is missing", async () => {
  verifyEmailClickToken.mockResolvedValueOnce({
    url: "https://example.com",
    workspaceId: "workspace-1",
  })
  const req = new Request("http://localhost/email-topic/click?u=signed")
  await GET(req)
  expect(recordClick).not.toHaveBeenCalled()
})

test("checks signed-token workspace and redirects when r param is missing", async () => {
  verifyEmailClickToken.mockResolvedValueOnce({
    url: "https://example.com",
    workspaceId: "workspace-1",
  })
  const req = new Request("http://localhost/email-topic/click?u=signed")

  const res = await GET(req)

  expect(res.status).toBe(302)
  expect(res.headers.get("location")).toBe("https://example.com/")
  expect(loadServableWorkspace).toHaveBeenCalledWith("workspace-1")
})

test("does not redirect u-only tokens without a workspace identity", async () => {
  verifyEmailClickToken.mockResolvedValueOnce({
    url: "https://example.com",
  })
  const req = new Request("http://localhost/email-topic/click?u=legacy")

  const res = await GET(req)

  expect(res.status).toBe(302)
  expect(res.headers.get("location")).toBe("http://localhost/")
  expect(recordClick).not.toHaveBeenCalled()
})

test("returns 410 for u-only tokens from a scheduled workspace", async () => {
  verifyEmailClickToken.mockResolvedValueOnce({
    url: "https://example.com",
    workspaceId: "workspace-1",
  })
  loadServableWorkspace.mockResolvedValue({ servable: false })
  const req = new Request("http://localhost/email-topic/click?u=signed")

  const res = await GET(req)

  expect(res.status).toBe(410)
  expect(res.headers.get("location")).toBeNull()
})

test("does not redirect when tracking token and signed token disagree on workspace", async () => {
  findAnalyticsWorkspaceIdByToken.mockResolvedValue("workspace-1")
  verifyEmailClickToken.mockResolvedValueOnce({
    url: "https://example.com",
    workspaceId: "workspace-2",
  })
  const req = new Request("http://localhost/email-topic/click?r=tok&u=signed")

  const res = await GET(req)

  expect(res.status).toBe(302)
  expect(res.headers.get("location")).toBe("http://localhost/")
})
