// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest"

const recordOpen = vi.fn().mockResolvedValue(undefined)
const findAnalyticsWorkspaceIdByToken = vi.fn()
const loadServableWorkspace = vi.fn()
const awardLeaderboardEmailEngagement = vi.fn().mockResolvedValue(undefined)

vi.mock("@chatbotx.io/analytics", () => ({
  emailTopicAnalyticsService: { recordOpen },
}))

vi.mock("@chatbotx.io/business", () => ({
  emailTopicService: { findAnalyticsWorkspaceIdByToken },
}))

vi.mock("@chatbotx.io/business/leaderboard", () => ({
  awardLeaderboardEmailEngagement,
}))

vi.mock("@/lib/workspace/load-servable-workspace", () => ({
  loadServableWorkspace,
}))

beforeEach(() => {
  vi.clearAllMocks()
  findAnalyticsWorkspaceIdByToken.mockResolvedValue(undefined)
  loadServableWorkspace.mockResolvedValue({ servable: true })
})

const { GET } = await import("../src/app/email-topic/open/route")

test("returns 1×1 GIF with no-cache headers", async () => {
  const req = new Request("http://localhost/email-topic/open")
  const res = await GET(req)
  expect(res.headers.get("Content-Type")).toBe("image/gif")
  expect(res.headers.get("Cache-Control")).toContain("no-store")
})

test("calls recordOpen with the token from ?r param", async () => {
  findAnalyticsWorkspaceIdByToken.mockResolvedValue("workspace-1")
  const req = new Request("http://localhost/email-topic/open?r=test-token-abc")
  await GET(req)
  expect(recordOpen).toHaveBeenCalledOnce()
  expect(recordOpen).toHaveBeenCalledWith("test-token-abc")
  expect(loadServableWorkspace).toHaveBeenCalledWith("workspace-1")
})

test("returns the GIF but skips recordOpen when the workspace is scheduled for deletion", async () => {
  findAnalyticsWorkspaceIdByToken.mockResolvedValue("workspace-1")
  loadServableWorkspace.mockResolvedValue({ servable: false })

  const req = new Request("http://localhost/email-topic/open?r=test-token-abc")
  const res = await GET(req)

  expect(res.headers.get("Content-Type")).toBe("image/gif")
  expect(recordOpen).not.toHaveBeenCalled()
})

test("does not call recordOpen when r param is missing", async () => {
  const req = new Request("http://localhost/email-topic/open")
  await GET(req)
  expect(recordOpen).not.toHaveBeenCalled()
})

test("scores the open for leaderboards after recording it", async () => {
  findAnalyticsWorkspaceIdByToken.mockResolvedValue("workspace-1")
  await GET(new Request("http://localhost/email-topic/open?r=tok"))
  expect(awardLeaderboardEmailEngagement).toHaveBeenCalledWith({
    token: "tok",
    kind: "open",
  })
})

test("does not score an open for a workspace scheduled for deletion", async () => {
  findAnalyticsWorkspaceIdByToken.mockResolvedValue("workspace-1")
  loadServableWorkspace.mockResolvedValue({ servable: false })
  await GET(new Request("http://localhost/email-topic/open?r=tok"))
  expect(awardLeaderboardEmailEngagement).not.toHaveBeenCalled()
})
