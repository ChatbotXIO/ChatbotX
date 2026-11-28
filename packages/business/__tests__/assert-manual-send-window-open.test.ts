import { beforeEach, describe, expect, it, vi } from "vitest"

const findActiveById = vi.fn()
const findByIdForWorkspace = vi.fn()

vi.mock("../src/flow/service", () => ({
  flowService: {
    findActiveById: (...args: unknown[]) => findActiveById(...args),
  },
}))
vi.mock("../src/flow-version/service", () => ({
  flowVersionService: {
    findByIdForWorkspace: (...args: unknown[]) => findByIdForWorkspace(...args),
  },
}))

const { assertManualSendWindowOpen } = await import(
  "../src/message/assert-manual-send-window-open"
)

const HOUR = 60 * 60 * 1000
const ago = (ms: number) => new Date(Date.now() - ms)

const check = (
  channel: string,
  lastIncomingMs: number | null,
  opts: {
    sendFrom?: "inbox" | "api" | null
    sourceId?: string | null
    input?: { flowId?: string; nodeId?: string }
  } = {},
) =>
  assertManualSendWindowOpen({
    workspaceId: "w1",
    conversation: { sourceId: opts.sourceId ?? null },
    contactInbox: {
      channel,
      lastIncomingMessageAt:
        lastIncomingMs === null ? null : ago(lastIncomingMs),
    },
    input: opts.input ?? {},
    sendFrom: opts.sendFrom === null ? undefined : (opts.sendFrom ?? "api"),
  })

describe("assertManualSendWindowOpen", () => {
  beforeEach(() => {
    findActiveById.mockReset()
    findByIdForWorkspace.mockReset()
  })

  it.each([
    ["whatsapp", 25 * HOUR],
    ["tiktok", 49 * HOUR],
    ["messenger", 8 * 24 * HOUR],
    ["instagram", 8 * 24 * HOUR],
  ])("rejects a manual %s send when closed", async (channel, ms) => {
    await expect(check(channel, ms)).rejects.toMatchObject({
      code: "messagingWindowClosed",
      httpStatusCode: 409,
    })
  })

  it.each([
    ["whatsapp", 23 * HOUR],
    ["tiktok", 30 * HOUR],
    ["messenger", 3 * 24 * HOUR],
    ["whatsapp", null],
    ["telegram", 100 * 24 * HOUR],
  ])("lets a %s send through (open/humanAgent/unknown/unlimited)", async (channel, ms) => {
    await expect(check(channel, ms)).resolves.toBeUndefined()
  })

  it("does not apply to comment conversations", async () => {
    await expect(
      check("messenger", 30 * 24 * HOUR, { sourceId: "comment:1" }),
    ).resolves.toBeUndefined()
  })

  it("does not apply to automation sends", async () => {
    await expect(
      check("whatsapp", 25 * HOUR, { sendFrom: null }),
    ).resolves.toBeUndefined()
  })

  it("allows a closed-window template-first flow", async () => {
    findActiveById.mockResolvedValue({ currentVersionId: "v1" })
    findByIdForWorkspace.mockResolvedValue({
      nodes: [
        {
          id: "start",
          data: {
            isStartNode: true,
            details: { steps: [{ stepType: "sendWaTemplateMessage" }] },
          },
        },
      ],
    })
    await expect(
      check("whatsapp", 25 * HOUR, { input: { flowId: "f1" } }),
    ).resolves.toBeUndefined()
  })

  it("rejects a closed-window flow that starts with free-form text", async () => {
    findActiveById.mockResolvedValue({ currentVersionId: "v1" })
    findByIdForWorkspace.mockResolvedValue({
      nodes: [
        {
          id: "start",
          data: {
            isStartNode: true,
            details: { steps: [{ stepType: "sendText" }] },
          },
        },
      ],
    })
    await expect(
      check("whatsapp", 25 * HOUR, { input: { flowId: "f1" } }),
    ).rejects.toMatchObject({ code: "messagingWindowClosed" })
  })
})
