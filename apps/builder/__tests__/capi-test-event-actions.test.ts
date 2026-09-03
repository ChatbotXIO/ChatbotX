// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { saveCapiTestEventCodeAction } from "../src/features/meta-conversions/actions/save-capi-test-event-code.action"
import { sendCapiTestEventAction } from "../src/features/meta-conversions/actions/send-capi-test-event.action"

type SaveHandler = (args: {
  parsedInput: {
    channel: "messenger" | "instagram" | "whatsapp"
    testEventCode: string | null
  }
  bindArgsParsedInputs: readonly [string, string]
}) => Promise<unknown>

type SendHandler = (args: {
  parsedInput: { channel: "messenger" | "instagram" | "whatsapp" }
  bindArgsParsedInputs: readonly [string, string]
}) => Promise<unknown>

const mocks = vi.hoisted(() => ({
  assertWorkspaceSuperAdmin: vi.fn(),
  messengerFindByIdForWorkspace: vi.fn(),
  instagramFindByIdForWorkspace: vi.fn(),
  whatsappFindByIdForWorkspace: vi.fn(),
  saveCapiTestEventCode: vi.fn(),
  enqueueTestEvent: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: SaveHandler | SendHandler) => handler
  return { workspaceActionClient: chain }
})

vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: mocks.assertWorkspaceSuperAdmin,
}))

vi.mock("@chatbotx.io/business", () => {
  class CapiTestEventError extends Error {
    readonly reason: string

    constructor(reason: string) {
      super(reason)
      this.name = "CapiTestEventError"
      this.reason = reason
    }
  }
  return {
    CapiTestEventError,
    messengerIntegrationService: {
      findByIdForWorkspace: mocks.messengerFindByIdForWorkspace,
    },
    instagramIntegrationService: {
      findByIdForWorkspace: mocks.instagramFindByIdForWorkspace,
    },
    integrationWhatsappService: {
      findByIdForWorkspace: mocks.whatsappFindByIdForWorkspace,
    },
    metaConversionsService: {
      saveCapiTestEventCode: mocks.saveCapiTestEventCode,
      enqueueTestEvent: mocks.enqueueTestEvent,
    },
  }
})

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
}))

const save = saveCapiTestEventCodeAction as unknown as SaveHandler
const send = sendCapiTestEventAction as unknown as SendHandler
const bound = ["ws-1", "im-1"] as const
const integration = { id: "im-1", workspaceId: "ws-1" }

describe("CAPI test event actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.messengerFindByIdForWorkspace.mockResolvedValue(integration)
    mocks.whatsappFindByIdForWorkspace.mockResolvedValue(integration)
  })

  test("save routes to the channel's integration lookup and stores the code", async () => {
    await expect(
      save({
        parsedInput: { channel: "messenger", testEventCode: "TEST33520" },
        bindArgsParsedInputs: bound,
      }),
    ).resolves.toEqual({ success: true, testEventCode: "TEST33520" })

    expect(mocks.assertWorkspaceSuperAdmin).toHaveBeenCalledWith("ws-1")
    expect(mocks.messengerFindByIdForWorkspace).toHaveBeenCalledWith({
      id: "im-1",
      workspaceId: "ws-1",
    })
    expect(mocks.saveCapiTestEventCode).toHaveBeenCalledWith({
      channel: "messenger",
      integration,
      testEventCode: "TEST33520",
    })
  })

  test("save with null clears the code for a WhatsApp integration", async () => {
    await save({
      parsedInput: { channel: "whatsapp", testEventCode: null },
      bindArgsParsedInputs: bound,
    })

    expect(mocks.whatsappFindByIdForWorkspace).toHaveBeenCalled()
    expect(mocks.saveCapiTestEventCode).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "whatsapp", testEventCode: null }),
    )
  })

  test("save surfaces a translated not-found error per channel", async () => {
    mocks.instagramFindByIdForWorkspace.mockResolvedValue(null)

    await expect(
      save({
        parsedInput: { channel: "instagram", testEventCode: "TEST1" },
        bindArgsParsedInputs: bound,
      }),
    ).rejects.toThrow("t:instagramNotFound")
    expect(mocks.saveCapiTestEventCode).not.toHaveBeenCalled()
  })

  test("send queues a test event and reports whether a row was created", async () => {
    mocks.enqueueTestEvent.mockResolvedValue({ id: "mce-1" })

    await expect(
      send({
        parsedInput: { channel: "messenger" },
        bindArgsParsedInputs: bound,
      }),
    ).resolves.toEqual({ success: true, queued: true })
    expect(mocks.enqueueTestEvent).toHaveBeenCalledWith({
      channel: "messenger",
      integration,
    })
  })

  test("send translates a CapiTestEventError reason for the toast", async () => {
    const { CapiTestEventError } = await import("@chatbotx.io/business")
    mocks.enqueueTestEvent.mockRejectedValue(
      new CapiTestEventError("noContactForTest"),
    )

    await expect(
      send({
        parsedInput: { channel: "messenger" },
        bindArgsParsedInputs: bound,
      }),
    ).rejects.toThrow("t:noContactForTest")
  })
})
