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
const findForButtonPayload = vi.fn()
const emit = vi.fn()
const loadServableWorkspace = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      magicLinkModel: { findFirst: findMagicLink },
      contactInboxModel: { findFirst: findContactInbox },
    },
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  flowVersionService: { findForButtonPayload },
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
    conversation: { id: "conversation-1", workspaceId: WORKSPACE_ID },
  })
  findForButtonPayload.mockReset()
  findForButtonPayload.mockResolvedValue({ nodes })
})

const { GET } = await import("../src/app/r/[workspaceId]/[name]/route")

const callRoute = (buttonId: string, flowVersionId?: string) => {
  const code = encodeButtonPayload({
    flowId: FLOW_ID,
    flowVersionId: flowVersionId ?? FLOW_VERSION_ID,
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

/**
 * Republishing a flow without the button strands every link already sent for it,
 * because the payload resolves the live version rather than the one that sent the
 * message. The click is unattributable, but the destination is not the button's —
 * it is the magic link's own — so the contact still gets there.
 */
test("still redirects when no node owns the button id", async () => {
  const response = await callRoute("9999999999999")

  expect(response.status).toBe(302)
  expect(response.headers.get("location")).toBe("https://example.com/landing")
  expect(emit).not.toHaveBeenCalled()
})

/**
 * An unpinned run omits the version from the payload, which is the common case:
 * no trigger, automated response or broadcast pins one. The route has to ask for
 * the flow's published version by flow id — handing an absent version id to a
 * `findFirst` matches an arbitrary row instead of failing.
 */
test("resolves the published version when the payload carries no version id", async () => {
  const response = await callRoute(stepButton.id, "")

  expect(findForButtonPayload).toHaveBeenCalledWith({
    flowId: FLOW_ID,
    workspaceId: WORKSPACE_ID,
    versionId: undefined,
  })
  expect(response.status).toBe(302)
  expect(response.headers.get("location")).toBe("https://example.com/landing")
})

test("passes the pinned version id through when the payload carries one", async () => {
  await callRoute(stepButton.id)

  expect(findForButtonPayload).toHaveBeenCalledWith({
    flowId: FLOW_ID,
    workspaceId: WORKSPACE_ID,
    versionId: FLOW_VERSION_ID,
  })
})

// Attribution is a side effect of the click; the destination is the contact's
// reason for clicking. An unresolvable version must not cost them the redirect.
test("still redirects when the flow version cannot be resolved", async () => {
  findForButtonPayload.mockResolvedValue(undefined)

  const response = await callRoute(stepButton.id)

  expect(response.status).toBe(302)
  expect(response.headers.get("location")).toBe("https://example.com/landing")
  expect(emit).not.toHaveBeenCalled()
})

test("still redirects when the resolved version holds no nodes", async () => {
  findForButtonPayload.mockResolvedValue({ nodes: null })

  const response = await callRoute(stepButton.id)

  expect(response.status).toBe(302)
  expect(emit).not.toHaveBeenCalled()
})

/**
 * `contactInboxId` rides in the payload, and `ContactInbox` has no `workspaceId`
 * of its own, so nothing about the id proves it belongs to the workspace whose
 * magic link is being served. Without this check a crafted code pointing at
 * another tenant's inbox would emit a `flow:clicked` naming this workspace but
 * that workspace's contact and conversation.
 */
test("does not attribute a click whose contact inbox belongs to another workspace", async () => {
  findContactInbox.mockResolvedValue({
    contactId: "contact-of-other-tenant",
    channel: "whatsapp",
    conversation: { id: "conversation-9", workspaceId: "9999999999999" },
  })

  const response = await callRoute(stepButton.id)

  expect(emit).not.toHaveBeenCalled()
  expect(response.status).toBe(302)
  expect(response.headers.get("location")).toBe("https://example.com/landing")
})

test("still redirects when the contact inbox no longer exists", async () => {
  findContactInbox.mockResolvedValue(undefined)

  const response = await callRoute(stepButton.id)

  expect(response.status).toBe(302)
  expect(emit).not.toHaveBeenCalled()
})
