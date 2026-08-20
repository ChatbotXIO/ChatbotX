// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  integrationQueueAdd: vi.fn(),
  verifyUserDataWebviewToken: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.inputSchema = vi.fn(() => chain)
  chain.action = vi.fn((handler: unknown) => handler)
  return { actionClient: chain }
})

vi.mock("@chatbotx.io/encryption", () => ({
  verifyUserDataWebviewToken: mocks.verifyUserDataWebviewToken,
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  GET_USER_DATA_WEBVIEW_SELECTION_PAYLOAD_TYPE: "getUserDataWebviewSelection",
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: mocks.integrationQueueAdd },
}))

const { submitDateTime, submitDateTimeRequestSchema } = await import(
  "../src/app/extensions/datetime-picker/actions/submit-date-time.action"
)

const VALID_PAYLOAD = {
  workspaceId: "workspace-1",
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  contactId: "contact-1",
  channel: "messenger",
  flowId: "flow-1",
  flowVersionId: "flow-version-1",
  stepId: "step-1",
  nodeId: "node-1",
  challengeId: "challenge-1",
  outputFieldId: "field-1",
  replyFormat: "date",
  expiresAt: Date.now() + 60_000,
}

describe("submitDateTimeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyUserDataWebviewToken.mockResolvedValue(VALID_PAYLOAD)
    mocks.integrationQueueAdd.mockResolvedValue(undefined)
  })

  test("enqueues sendFlow with the exact metadata payload from the verified token", async () => {
    const result = await submitDateTime({
      token: "token-1",
      selectedValue: "2026-08-21T00:00:00.000Z",
    })

    expect(mocks.verifyUserDataWebviewToken).toHaveBeenCalledWith("token-1")
    expect(mocks.integrationQueueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.integrationQueueAdd).toHaveBeenCalledWith("sendFlow", {
      type: "sendFlow",
      data: {
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        nodeId: "node-1",
        startFromStepId: "step-1",
        metadata: {
          type: "getUserDataWebviewSelection",
          stepId: "step-1",
          challengeId: "challenge-1",
          contactInboxId: "contact-inbox-1",
          selectedValue: "2026-08-21T00:00:00.000Z",
        },
        origin: "channel",
      },
    })
    expect(result).toEqual({ completed: true })
  })

  test("rejects a non-ISO-datetime selectedValue", () => {
    expect(
      submitDateTimeRequestSchema.safeParse({
        token: "token-1",
        selectedValue: "not-a-date",
      }).success,
    ).toBe(false)

    expect(
      submitDateTimeRequestSchema.safeParse({
        token: "token-1",
        selectedValue: "2026-08-21T00:00:00.000Z",
      }).success,
    ).toBe(true)
  })

  test("does not enqueue when the token fails verification (tampered/expired token)", async () => {
    mocks.verifyUserDataWebviewToken.mockRejectedValue(
      new Error("invalid token"),
    )

    await expect(
      submitDateTime({
        token: "tampered-token",
        selectedValue: "2026-08-21T00:00:00.000Z",
      }),
    ).rejects.toThrow("invalid token")

    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })
})
