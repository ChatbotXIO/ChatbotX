// @vitest-environment node
import {
  buttonStepDefaultFn,
  encodeButtonPayload,
  type SendMessageNodeSchema,
  sendMessageNodeDefaultFn,
  sendTextStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { NextRequest } from "next/server"
import { beforeEach, expect, test, vi } from "vitest"

const FLOW_ID = "1000000000001"
const FLOW_VERSION_ID = "1000000000002"
const CONTACT_INBOX_ID = "1000000000003"
const WORKSPACE_ID = "1000000000004"

const findMagicLink = vi.fn()
const findContactInbox = vi.fn()
const findFlowVersion = vi.fn()
const emit = vi.fn()
const loadServableWorkspace = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      magicLinkModel: { findFirst: findMagicLink },
      contactInboxModel: { findFirst: findContactInbox },
      flowVersionModel: { findFirst: findFlowVersion },
    },
  },
}))

vi.mock("@chatbotx.io/event-bus", () => ({ emit }))

vi.mock("@/lib/workspace/load-servable-workspace", () => ({
  loadServableWorkspace,
}))

const stepButton = buttonStepDefaultFn({ label: "Buy now" })
const quickReply = buttonStepDefaultFn({ label: "Yes" })

type NodeDetails = SendMessageNodeSchema["data"]["details"]

const makeNode = (
  id: string,
  details: Partial<NodeDetails>,
): SendMessageNodeSchema => {
  const node = sendMessageNodeDefaultFn({ nodeProps: { id } })
  return {
    ...node,
    data: { ...node.data, details: { ...node.data.details, ...details } },
  }
}

const nodes = [
  makeNode("node-1", {
    steps: [sendTextStepDefaultFn({ text: "Hi", buttons: [stepButton] })],
  }),
  makeNode("node-2", { quickReplies: [quickReply] }),
]

beforeEach(() => {
  emit.mockReset()
  emit.mockResolvedValue(undefined)
  loadServableWorkspace.mockReset()
  loadServableWorkspace.mockResolvedValue({ servable: true })
  findMagicLink.mockReset()
  findMagicLink.mockResolvedValue({
    id: "magic-1",
    url: "https://example.com/landing",
  })
  findContactInbox.mockReset()
  findContactInbox.mockResolvedValue({
    contactId: "contact-1",
    channel: "whatsapp",
    conversation: { id: "conversation-1" },
  })
  findFlowVersion.mockReset()
  findFlowVersion.mockResolvedValue({ nodes })
})

const { GET } = await import("../src/app/r/[workspaceId]/[name]/route")

const callRoute = (buttonId: string) => {
  const code = encodeButtonPayload({
    flowId: FLOW_ID,
    flowVersionId: FLOW_VERSION_ID,
    buttonId,
    contactInboxId: CONTACT_INBOX_ID,
  })
  const request = new NextRequest(
    `http://localhost/r/${WORKSPACE_ID}/promo?code=${encodeURIComponent(code)}`,
  )
  return GET(request, {
    params: Promise.resolve({ workspaceId: WORKSPACE_ID, name: "promo" }),
  })
}

test("redirects a step button magic link and reports its node", async () => {
  const response = await callRoute(stepButton.id)

  expect(response.status).toBe(302)
  expect(response.headers.get("location")).toBe("https://example.com/landing")
  expect(emit).toHaveBeenCalledWith(
    "flow:clicked",
    expect.objectContaining({
      nodeId: "node-1",
      action: expect.objectContaining({ buttonId: stepButton.id }),
    }),
  )
})

// Quick replies use the same editor as step buttons, so they can carry a
// website link too. Before they were resolvable, this path returned 404.
test("redirects a quick reply magic link and reports its node", async () => {
  const response = await callRoute(quickReply.id)

  expect(response.status).toBe(302)
  expect(response.headers.get("location")).toBe("https://example.com/landing")
  expect(emit).toHaveBeenCalledWith(
    "flow:clicked",
    expect.objectContaining({
      nodeId: "node-2",
      action: expect.objectContaining({ buttonId: quickReply.id }),
    }),
  )
})

test("returns 404 when no node owns the button id", async () => {
  const response = await callRoute("9999999999999")

  expect(response.status).toBe(404)
  expect(emit).not.toHaveBeenCalled()
})
