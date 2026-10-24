import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findIntegrationWhatsapp,
  incrementCompletedCount,
  recordActivity,
  setValues,
  tx,
} = vi.hoisted(() => ({
  findIntegrationWhatsapp: vi.fn(),
  incrementCompletedCount: vi.fn(
    async () => "flow-internal-1" as string | null,
  ),
  recordActivity: vi.fn(async () => true),
  setValues: vi.fn(async () => undefined),
  tx: { tag: "tx" },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationWhatsappModel: { findFirst: findIntegrationWhatsapp },
    },
    transaction: async (callback: (client: unknown) => Promise<unknown>) =>
      callback(tx),
  },
}))

vi.mock("../src/contact-activity/service", () => ({
  contactActivityService: { record: recordActivity },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappFlowRepository: {
    incrementCompletedCount,
  },
}))

vi.mock("../src/contact-custom-field/service", () => ({
  contactCustomFieldService: {
    setValues,
  },
}))

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { serializeFlowValue, whatsappFlowResponseService } = await import(
  "../src/whatsapp-flow-response/service"
)

describe("serializeFlowValue", () => {
  test("coerces WhatsApp flow response values for custom-field storage", () => {
    expect(serializeFlowValue("Alice")).toBe("Alice")
    expect(serializeFlowValue(42)).toBe("42")
    expect(serializeFlowValue(true)).toBe("true")
    expect(serializeFlowValue({ nested: "value" })).toBe('{"nested":"value"}')
    expect(serializeFlowValue(null)).toBeNull()
    expect(serializeFlowValue(undefined)).toBeNull()
  })
})

describe("whatsappFlowResponseService.applyResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findIntegrationWhatsapp.mockResolvedValue({ id: "wa-1" })
  })

  test("increments completed count and writes mapped fields", async () => {
    await whatsappFlowResponseService.applyResponse({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInbox: { inboxId: "inbox-1" } as never,
      flowSourceId: "meta-flow-1",
      fieldMappings: [
        { paramKey: "name", paramLabel: "Name", customFieldId: "cf-1" },
        { paramKey: "ignored", customFieldId: null },
        { paramKey: "count", customFieldId: "cf-2" },
      ],
      flowResponse: { name: "Alice", count: 3 },
    })

    expect(incrementCompletedCount).toHaveBeenCalledWith(
      { integrationWhatsappId: "wa-1", sourceId: "meta-flow-1" },
      tx,
    )
    expect(setValues).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [
        { customFieldId: "cf-1", value: "Alice" },
        { customFieldId: "cf-2", value: "3" },
      ],
    })
  })

  test("uses the provided integration id without looking it up", async () => {
    await whatsappFlowResponseService.applyResponse({
      workspaceId: "ws-1",
      contactId: "contact-1",
      integrationWhatsappId: "wa-direct",
      flowSourceId: "meta-flow-1",
      fieldMappings: [],
      flowResponse: {},
    })

    expect(findIntegrationWhatsapp).not.toHaveBeenCalled()
    expect(incrementCompletedCount).toHaveBeenCalledWith(
      { integrationWhatsappId: "wa-direct", sourceId: "meta-flow-1" },
      tx,
    )
    expect(setValues).not.toHaveBeenCalled()
  })

  const completionInput = {
    workspaceId: "ws-1",
    contactId: "contact-1",
    integrationWhatsappId: "wa-1",
    flowSourceId: "meta-flow-1",
    fieldMappings: [],
    flowResponse: {},
  }

  test("records the completion under the flow's internal id in the same transaction", async () => {
    await whatsappFlowResponseService.applyResponse(completionInput)

    expect(recordActivity).toHaveBeenCalledWith({
      entries: [
        expect.objectContaining({
          activityType: "formCompleted",
          contactId: "contact-1",
          referenceId: "flow-internal-1",
          referenceType: "whatsappFlow",
        }),
      ],
      tx,
      workspaceId: "ws-1",
    })
  })

  test("records nothing when the flow row no longer exists", async () => {
    incrementCompletedCount.mockResolvedValueOnce(null)

    await whatsappFlowResponseService.applyResponse(completionInput)

    expect(recordActivity).not.toHaveBeenCalled()
  })

  test("fails the response (so it retries) when recording fails", async () => {
    recordActivity.mockRejectedValueOnce(new Error("db down"))

    await expect(
      whatsappFlowResponseService.applyResponse(completionInput),
    ).rejects.toThrow("db down")
  })

  test("records nothing when the integration cannot be resolved", async () => {
    findIntegrationWhatsapp.mockResolvedValue(null)

    await whatsappFlowResponseService.applyResponse({
      ...completionInput,
      integrationWhatsappId: null,
      contactInbox: { inboxId: "inbox-1" } as never,
    })

    expect(recordActivity).not.toHaveBeenCalled()
    expect(incrementCompletedCount).not.toHaveBeenCalled()
  })
})
