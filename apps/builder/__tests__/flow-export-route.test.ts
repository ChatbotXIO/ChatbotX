// @vitest-environment node

import { waitNodeDefaultFn } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { GET } from "../src/app/(no-sidebar)/space/[workspaceId]/flows/[id]/export/route"

const {
  mockFindBy,
  mockFindPublished,
  mockFindManyByIds,
  mockGetCurrentUserAndTargetWorkspace,
} = vi.hoisted(() => ({
  mockFindBy: vi.fn(),
  mockFindPublished: vi.fn(),
  mockFindManyByIds: vi.fn(),
  mockGetCurrentUserAndTargetWorkspace: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  flowService: { findBy: mockFindBy },
  flowVersionService: { findPublished: mockFindPublished },
  customFieldService: { findManyByIds: mockFindManyByIds },
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
    mockFindManyByIds.mockResolvedValue([])
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
    const waitNode = waitNodeDefaultFn({ nodeProps: { id: "1" } })
    const publishedVersion = {
      startNodeId: "1",
      nodes: [waitNode],
      edges: [],
    }
    mockFindPublished.mockResolvedValue(publishedVersion)

    const response = await callRoute("ws-1", "flow-1")

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.formatVersion).toBe(2)
    expect(body.flows[0].nodes).toEqual(publishedVersion.nodes)
    expect(body.flows[0].startNodeId).toBe("1")
    expect(body.customFields).toEqual({})
    expect(mockFindPublished).toHaveBeenCalledWith({
      flowId: "flow-1",
      workspaceId: "ws-1",
    })
  })

  test("emits a customFields manifest for referenced ids only, scoped to the flow's workspace", async () => {
    mockFindBy.mockResolvedValue({
      id: "flow-1",
      workspaceId: "ws-1",
      name: "Onboarding",
      active: true,
      enableInInbox: true,
    })
    const setCustomFieldNode = {
      id: "1",
      position: { x: 0, y: 0 },
      measured: { width: 288, height: 100 },
      type: "sendMessage",
      data: {
        name: "Send Message",
        isStartNode: true,
        details: {
          beforeStep: {
            id: "b1",
            stepType: "chooseChannel",
            channel: "omnichannel",
          },
          steps: [
            {
              id: "s1",
              stepType: "setCustomField",
              inputFieldId: "42",
              operation: "O01",
              value: "hi",
            },
          ],
          quickReplies: [],
        },
      },
    }
    mockFindPublished.mockResolvedValue({
      startNodeId: "1",
      nodes: [setCustomFieldNode],
      edges: [],
    })
    mockFindManyByIds.mockResolvedValue([
      { id: "42", name: "Birthday", type: "date" },
    ])

    const response = await callRoute("ws-1", "flow-1")

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.customFields).toEqual({
      "42": { name: "Birthday", type: "date" },
    })
    expect(mockFindManyByIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["42"],
    })
  })

  test("omits an id that resolves to nothing (already-deleted field) and still returns 200", async () => {
    mockFindBy.mockResolvedValue({
      id: "flow-1",
      workspaceId: "ws-1",
      name: "Onboarding",
      active: true,
      enableInInbox: true,
    })
    const setCustomFieldNode = {
      id: "1",
      position: { x: 0, y: 0 },
      measured: { width: 288, height: 100 },
      type: "sendMessage",
      data: {
        name: "Send Message",
        isStartNode: true,
        details: {
          beforeStep: {
            id: "b1",
            stepType: "chooseChannel",
            channel: "omnichannel",
          },
          steps: [
            {
              id: "s1",
              stepType: "setCustomField",
              inputFieldId: "42",
              operation: "O01",
              value: "hi",
            },
          ],
          quickReplies: [],
        },
      },
    }
    mockFindPublished.mockResolvedValue({
      startNodeId: "1",
      nodes: [setCustomFieldNode],
      edges: [],
    })
    mockFindManyByIds.mockResolvedValue([])

    const response = await callRoute("ws-1", "flow-1")

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.customFields).toEqual({})
  })
})
