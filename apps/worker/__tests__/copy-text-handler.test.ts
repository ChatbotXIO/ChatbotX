import { beforeEach, describe, expect, test, vi } from "vitest"
import type { CopyTextReplyProps } from "../src/integration/handlers/copy-text"

const { resolveContactVariablesDeep, warn } = vi.hoisted(() => ({
  resolveContactVariablesDeep: vi.fn(
    async (_contactId: string, value: string) => value,
  ),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/variables", () => ({ resolveContactVariablesDeep }))
vi.mock("../src/lib/logger", () => ({ logger: { warn } }))

import { resolveCopyTextReply } from "../src/integration/handlers/copy-text"

const makeProps = (text: string, overrides = {}) =>
  ({
    conversation: { id: "20", contactId: "10", workspaceId: "1" },
    contactInbox: { id: "30" },
    targetNodeId: "70",
    step: { id: "60", stepType: "copyText", text },
    ...overrides,
  }) as unknown as CopyTextReplyProps

describe("resolveCopyTextReply", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("replies with the text as a text step", async () => {
    expect(await resolveCopyTextReply(makeProps("PIXCODE"))).toEqual({
      id: "60",
      nodeId: "70",
      stepType: "sendText",
      text: "PIXCODE",
      buttons: [],
    })
  })

  test("leaves the node id out when the run has no target node", async () => {
    const reply = await resolveCopyTextReply(
      makeProps("PIXCODE", { targetNodeId: undefined }),
    )
    expect(reply).not.toHaveProperty("nodeId")
  })

  test("resolves variables with the send-time context", async () => {
    resolveContactVariablesDeep.mockResolvedValueOnce("RESOLVED")

    expect(
      await resolveCopyTextReply(
        makeProps("{{pix_code}}", { appointmentId: "77", sentByUserId: "9" }),
      ),
    ).toMatchObject({ text: "RESOLVED" })
    expect(resolveContactVariablesDeep).toHaveBeenCalledWith(
      "10",
      "{{pix_code}}",
      expect.objectContaining({ appointmentId: "77", sentByUserId: "9" }),
    )
  })

  test("still replies with a text too long for a native copy button", async () => {
    const text = "x".repeat(400)
    expect(await resolveCopyTextReply(makeProps(text))).toMatchObject({ text })
  })

  test("returns nothing and logs when the text resolves to nothing", async () => {
    resolveContactVariablesDeep.mockResolvedValueOnce("  ")

    expect(await resolveCopyTextReply(makeProps("{{pix_code}}"))).toBeNull()
    expect(warn).toHaveBeenCalled()
  })
})
