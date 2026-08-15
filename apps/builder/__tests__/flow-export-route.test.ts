// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { GET } from "../src/app/(no-sidebar)/space/[workspaceId]/flows/[id]/export/route"

const { mockFindBy, mockFindPublished, mockGetCurrentUserAndTargetWorkspace } =
  vi.hoisted(() => ({
    mockFindBy: vi.fn(),
    mockFindPublished: vi.fn(),
    mockGetCurrentUserAndTargetWorkspace: vi.fn(),
  }))

vi.mock("@chatbotx.io/business", () => ({
  flowService: { findBy: mockFindBy },
  flowVersionService: { findPublished: mockFindPublished },
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  FLOW_EXPORT_FORMAT_VERSION: 1,
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: mockGetCurrentUserAndTargetWorkspace,
}))

const ALLOWED_MEMBER = {
  targetWorkspaceMember: { permissions: { flows: true } },
}

const callRoute = (workspaceId: string, id: string) =>
  GET(new Request(`http://localhost/space/${workspaceId}/flows/${id}/export`), {
    params: Promise.resolve({ workspaceId, id }),
  })

describe("flow export route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue(ALLOWED_MEMBER)
  })

  test("denies access with a bare 404 when the user lacks permission", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      targetWorkspaceMember: { permissions: {} },
    })

    const response = await callRoute("ws-1", "flow-1")

    expect(response.status).toBe(404)
    expect(mockFindBy).not.toHaveBeenCalled()
  })

  test("returns 404 when the flow does not exist", async () => {
    mockFindBy.mockResolvedValue(undefined)

    const response = await callRoute("ws-1", "flow-1")

    expect(response.status).toBe(404)
    expect(mockFindPublished).not.toHaveBeenCalled()
  })

  test("returns a distinct notPublished error instead of a blank 404", async () => {
    mockFindBy.mockResolvedValue({
      id: "flow-1",
      workspaceId: "ws-1",
      name: "Onboarding",
    })
    mockFindPublished.mockResolvedValue(undefined)

    const response = await callRoute("ws-1", "flow-1")

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ code: "notPublished" })
  })

  test("exports the published version, not the draft, after a post-publish edit", async () => {
    mockFindBy.mockResolvedValue({
      id: "flow-1",
      workspaceId: "ws-1",
      name: "Onboarding",
      active: true,
      enableInInbox: true,
    })
    const publishedVersion = {
      startNodeId: "1",
      nodes: [{ id: "1", type: "wait" }],
      edges: [],
    }
    mockFindPublished.mockResolvedValue(publishedVersion)

    const response = await callRoute("ws-1", "flow-1")

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.flows[0].nodes).toEqual(publishedVersion.nodes)
    expect(body.flows[0].startNodeId).toBe("1")
    expect(mockFindPublished).toHaveBeenCalledWith({
      flowId: "flow-1",
      workspaceId: "ws-1",
    })
  })
})
