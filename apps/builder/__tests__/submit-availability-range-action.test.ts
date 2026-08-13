// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const RANGE_TOKEN_ERROR_RE = /range token/

const mocks = vi.hoisted(() => ({
  integrationQueueAdd: vi.fn(),
  verifyAppointmentWebviewToken: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.inputSchema = vi.fn(() => chain)
  chain.action = vi.fn((handler: unknown) => handler)
  return { actionClient: chain }
})

vi.mock("@chatbotx.io/encryption", () => ({
  verifyAppointmentWebviewToken: mocks.verifyAppointmentWebviewToken,
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  APPOINTMENT_AVAILABILITY_RANGE_SELECTION_PAYLOAD_TYPE:
    "appointmentAvailabilityRangeSelection",
  APPOINTMENT_AVAILABILITY_RANGE_SKIPPED_PAYLOAD_TYPE:
    "appointmentAvailabilityRangeSkipped",
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: mocks.integrationQueueAdd },
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn() },
}))

const { submitAvailabilityRange } = await import(
  "../src/app/booking/range-picker/actions/submit-availability-range.action"
)
const { submitAvailabilityRangeRequestSchema } = await import(
  "../src/features/booking-webview/schemas/availability-range-action"
)

describe("submitAvailabilityRangeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyAppointmentWebviewToken.mockResolvedValue({
      mode: "selectAvailabilityRange",
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      flowId: "flow-1",
      flowVersionId: "flow-version-1",
      nodeId: "node-1",
      stepId: "step-1",
    })
    mocks.integrationQueueAdd.mockResolvedValue(undefined)
  })

  test("validates local datetime ranges before the action runs", () => {
    expect(
      submitAvailabilityRangeRequestSchema.safeParse({
        token: "token-1",
        startDate: "2026-08-12T23:59:00.000",
        endDate: "2026-08-10T00:00:00.000",
      }).success,
    ).toBe(false)

    expect(
      submitAvailabilityRangeRequestSchema.safeParse({
        token: "token-1",
        startDate: "2026-08-10T00:00:00.000",
        endDate: "2026-08-12T23:59:00.000",
      }).success,
    ).toBe(true)
  })

  test("queues range selection metadata with a deterministic job id", async () => {
    const startDate = "2026-08-10T00:00:00.000"
    const endDate = "2026-08-12T23:59:00.000"

    await submitAvailabilityRange({
      token: "token-1",
      startDate,
      endDate,
    })

    expect(mocks.integrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      {
        type: "sendFlow",
        data: {
          conversationId: "conversation-1",
          contactInboxId: "contact-inbox-1",
          flowId: "flow-1",
          flowVersionId: "flow-version-1",
          nodeId: "node-1",
          startFromStepId: "step-1",
          metadata: {
            type: "appointmentAvailabilityRangeSelection",
            stepId: "step-1",
            contactInboxId: "contact-inbox-1",
            startDate,
            endDate,
          },
          origin: "channel",
        },
      },
      {
        jobId: `appointment-range-conversation-1-step-1-${new Date(startDate).getTime()}-${new Date(endDate).getTime()}`,
      },
    )
  })

  test("queues skipped metadata with a deterministic job id", async () => {
    await submitAvailabilityRange({
      token: "token-1",
      skip: true,
    })

    expect(mocks.integrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: {
            type: "appointmentAvailabilityRangeSkipped",
            stepId: "step-1",
            contactInboxId: "contact-inbox-1",
          },
        }),
      }),
      {
        jobId: "appointment-range-skip-conversation-1-step-1",
      },
    )
  })

  test("rejects non-range appointment tokens", async () => {
    mocks.verifyAppointmentWebviewToken.mockResolvedValue({
      mode: "book",
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      flowId: "flow-1",
      flowVersionId: "flow-version-1",
      stepId: "step-1",
    })

    await expect(
      submitAvailabilityRange({
        token: "token-1",
        skip: true,
      }),
    ).rejects.toThrow(RANGE_TOKEN_ERROR_RE)
    expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
  })
})
