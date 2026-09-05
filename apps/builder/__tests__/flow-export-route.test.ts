// @vitest-environment node

import { waitNodeDefaultFn } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { GET } from "../src/app/(no-sidebar)/space/[workspaceId]/flows/[id]/export/route"

const {
  mockFindBy,
  mockFindPublished,
  mockFindManyByIds,
  mockBotFieldFindManyByIds,
  mockGetCurrentUserAndTargetWorkspace,
} = vi.hoisted(() => ({
  mockFindBy: vi.fn(),
  mockFindPublished: vi.fn(),
  mockFindManyByIds: vi.fn(),
  mockBotFieldFindManyByIds: vi.fn(),
  mockGetCurrentUserAndTargetWorkspace: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  flowService: { findBy: mockFindBy },
  flowVersionService: { findPublished: mockFindPublished },
  customFieldService: { findManyByIds: mockFindManyByIds },
  botFieldService: { findManyByIds: mockBotFieldFindManyByIds },
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
    mockBotFieldFindManyByIds.mockResolvedValue([])
  })

  test("denies access with a bare 404 when the user lacks permission", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      targetWorkspaceMember: { permissions: {} },
    })

    const response = await callRoute("1", "2")

    expect(response.status).toBe(404)
    expect(mockFindBy).not.toHaveBeenCalled()
  })

  test("returns 404 when the flow does not exist", async () => {
    mockFindBy.mockResolvedValue(undefined)

    const response = await callRoute("1", "2")

    expect(response.status).toBe(404)
    expect(mockFindPublished).not.toHaveBeenCalled()
  })

  test("returns a distinct notPublished error instead of a blank 404", async () => {
    mockFindBy.mockResolvedValue({
      id: "2",
      workspaceId: "1",
      name: "Onboarding",
    })
    mockFindPublished.mockResolvedValue(undefined)

    const response = await callRoute("1", "2")

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ code: "notPublished" })
  })

  test("exports the published version, not the draft, after a post-publish edit", async () => {
    mockFindBy.mockResolvedValue({
      id: "2",
      workspaceId: "1",
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

    const response = await callRoute("1", "2")

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.formatVersion).toBe(2)
    expect(body.flows[0].nodes).toEqual(publishedVersion.nodes)
    expect(body.flows[0].startNodeId).toBe("1")
    expect(body.customFields).toEqual({})
    expect(body.botFields).toEqual({})
    expect(mockFindPublished).toHaveBeenCalledWith({
      flowId: "2",
      workspaceId: "1",
    })
  })

  test("emits a customFields manifest for referenced ids only, scoped to the flow's workspace", async () => {
    mockFindBy.mockResolvedValue({
      id: "2",
      workspaceId: "1",
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
            id: "31",
            stepType: "chooseChannel",
            channel: "omnichannel",
          },
          steps: [
            {
              id: "32",
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

    const response = await callRoute("1", "2")

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.customFields).toEqual({
      "42": { name: "Birthday", type: "date" },
    })
    expect(mockFindManyByIds).toHaveBeenCalledWith({
      workspaceId: "1",
      ids: ["42"],
    })
  })

  test("omits an id that resolves to nothing (already-deleted field) and still returns 200", async () => {
    mockFindBy.mockResolvedValue({
      id: "2",
      workspaceId: "1",
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
            id: "31",
            stepType: "chooseChannel",
            channel: "omnichannel",
          },
          steps: [
            {
              id: "32",
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

    const response = await callRoute("1", "2")

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.customFields).toEqual({})
  })

  test("emits a botFields manifest for a bot_field token, scoped to the flow's workspace", async () => {
    mockFindBy.mockResolvedValue({
      id: "2",
      workspaceId: "1",
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
            id: "31",
            stepType: "chooseChannel",
            channel: "omnichannel",
          },
          steps: [
            {
              id: "32",
              stepType: "setCustomField",
              inputFieldId: "bot_field:7",
              operation: "O01",
              value: "42",
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
    mockBotFieldFindManyByIds.mockResolvedValue([
      { id: "7", name: "Loyalty Points", type: "number" },
    ])

    const response = await callRoute("1", "2")

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.customFields).toEqual({})
    expect(body.botFields).toEqual({
      "7": { name: "Loyalty Points", type: "number" },
    })
    expect(mockBotFieldFindManyByIds).toHaveBeenCalledWith({
      workspaceId: "1",
      ids: ["7"],
    })
  })

  test("keeps customField and botField manifests separate for tokens found in the same flow", async () => {
    mockFindBy.mockResolvedValue({
      id: "2",
      workspaceId: "1",
      name: "Onboarding",
      active: true,
      enableInInbox: true,
    })
    const node = {
      id: "1",
      position: { x: 0, y: 0 },
      measured: { width: 288, height: 100 },
      type: "sendMessage",
      data: {
        name: "Send Message",
        isStartNode: true,
        details: {
          beforeStep: {
            id: "31",
            stepType: "chooseChannel",
            channel: "omnichannel",
          },
          steps: [
            {
              id: "32",
              stepType: "setCustomField",
              inputFieldId: "42",
              operation: "O01",
              value: "hi",
            },
            {
              id: "33",
              stepType: "setCustomField",
              inputFieldId: "bot_field:7",
              operation: "O01",
              value: "42",
            },
          ],
          quickReplies: [],
        },
      },
    }
    mockFindPublished.mockResolvedValue({
      startNodeId: "1",
      nodes: [node],
      edges: [],
    })
    mockFindManyByIds.mockResolvedValue([
      { id: "42", name: "Birthday", type: "date" },
    ])
    mockBotFieldFindManyByIds.mockResolvedValue([
      { id: "7", name: "Loyalty Points", type: "number" },
    ])

    const response = await callRoute("1", "2")

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.customFields).toEqual({
      "42": { name: "Birthday", type: "date" },
    })
    expect(body.botFields).toEqual({
      "7": { name: "Loyalty Points", type: "number" },
    })
    expect(mockFindManyByIds).toHaveBeenCalledWith({
      workspaceId: "1",
      ids: ["42"],
    })
    expect(mockBotFieldFindManyByIds).toHaveBeenCalledWith({
      workspaceId: "1",
      ids: ["7"],
    })
  })
})
