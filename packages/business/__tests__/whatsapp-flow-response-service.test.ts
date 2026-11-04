import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findCustomFields,
  findIntegrationWhatsapp,
  incrementCompletedCount,
  recordActivity,
  resolveTimezone,
  setValues,
  timezoneResolverInputs,
  tx,
} = vi.hoisted(() => ({
  // Every looked-up field is a text field unless a test says otherwise.
  findCustomFields: vi.fn(async ({ ids }: { ids: string[] }) =>
    ids.map((id) => ({ id, type: "shortText" })),
  ),
  findIntegrationWhatsapp: vi.fn(),
  incrementCompletedCount: vi.fn(
    async () => "flow-internal-1" as string | null,
  ),
  recordActivity: vi.fn(async () => true),
  resolveTimezone: vi.fn(async () => "Asia/Ho_Chi_Minh"),
  timezoneResolverInputs: [] as unknown[],
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

vi.mock("../src/custom-field/service", () => ({
  customFieldService: { findManyByIds: findCustomFields },
}))

// The contact's zone, without its contact/workspace lookup.
vi.mock("../src/contact-custom-field/normalize", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createSourceTimezoneResolver: (input: unknown) => {
    timezoneResolverInputs.push(input)
    return resolveTimezone
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
    expect(
      serializeFlowValue({
        "start-date": "2024-10-21",
        "end-date": "2024-10-25",
      }),
    ).toBe("2024-10-21 - 2024-10-25")
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

  describe("file answers", () => {
    const file = (mediaId: string, fileName = `${mediaId}.pdf`) => ({
      mediaId,
      fileName,
      mimeType: "application/pdf",
      size: 10,
      url: `https://cdn.example.com/${fileName}`,
    })
    const apply = (
      input: Partial<
        Parameters<typeof whatsappFlowResponseService.applyResponse>[0]
      >,
    ) =>
      whatsappFlowResponseService.applyResponse({
        workspaceId: "ws-1",
        contactId: "contact-1",
        integrationWhatsappId: "wa-1",
        flowSourceId: "meta-flow-1",
        fieldMappings: [],
        flowResponse: {},
        ...input,
      })

    test("stores every file URL, comma-separated, by default", async () => {
      await apply({
        fieldMappings: [{ paramKey: "docs", customFieldId: "cf-1" }],
        flowResponse: { docs: [{ id: "1" }, { id: "2" }] },
        flowFiles: { docs: [file("1"), file("2")] },
      })

      expect(setValues).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        contactId: "contact-1",
        fields: [
          {
            customFieldId: "cf-1",
            value:
              "https://cdn.example.com/1.pdf, https://cdn.example.com/2.pdf",
          },
        ],
      })
    })

    test.each([
      [
        "allUrls",
        "https://cdn.example.com/1.pdf, https://cdn.example.com/2.pdf",
      ],
      ["firstUrl", "https://cdn.example.com/1.pdf"],
    ] as const)("honours the %s format", async (fileFormat, value) => {
      await apply({
        fieldMappings: [
          { paramKey: "docs", customFieldId: "cf-1", fileFormat },
        ],
        flowFiles: { docs: [file("1"), file("2")] },
      })

      expect(setValues).toHaveBeenCalledWith(
        expect.objectContaining({ fields: [{ customFieldId: "cf-1", value }] }),
      )
    })

    test("leaves the field alone when no file was kept", async () => {
      await apply({
        fieldMappings: [{ paramKey: "docs", customFieldId: "cf-1" }],
        flowResponse: { docs: [{ id: "1", file_name: "a.pdf" }] },
        flowFiles: { docs: [] },
      })

      // Never the provider's raw answer (media ids), and nothing is cleared.
      expect(setValues).not.toHaveBeenCalled()
    })

    test("maps file and text answers of one response together", async () => {
      await apply({
        fieldMappings: [
          { paramKey: "name", customFieldId: "cf-name" },
          { paramKey: "docs", customFieldId: "cf-docs" },
        ],
        flowResponse: { name: "Alice", docs: [{ id: "1" }] },
        flowFiles: { docs: [file("1")] },
      })

      expect(setValues).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [
            { customFieldId: "cf-name", value: "Alice" },
            {
              customFieldId: "cf-docs",
              value: "https://cdn.example.com/1.pdf",
            },
          ],
        }),
      )
    })

    test("a mapping named like an inherited object member reads its own answer", async () => {
      await apply({
        fieldMappings: [{ paramKey: "constructor", customFieldId: "cf-1" }],
        flowResponse: { constructor: "Alice", docs: [{ id: "1" }] },
        flowFiles: { docs: [file("1")] },
      })

      expect(setValues).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [{ customFieldId: "cf-1", value: "Alice" }],
        }),
      )
    })

    test("a file answer the customer left empty keeps the field as it was", async () => {
      await apply({
        fieldMappings: [
          { paramKey: "docs", customFieldId: "cf-1", fileFormat: "allUrls" },
        ],
        flowResponse: { docs: [] },
      })

      expect(setValues).not.toHaveBeenCalled()
    })

    test("file links mapped to a non-text field are skipped, other answers still saved", async () => {
      findCustomFields.mockResolvedValueOnce([
        { id: "cf-docs", type: "number" },
      ])

      await apply({
        fieldMappings: [
          { paramKey: "name", customFieldId: "cf-name" },
          { paramKey: "docs", customFieldId: "cf-docs" },
        ],
        flowResponse: { name: "Alice", docs: [{ id: "1" }] },
        flowFiles: { docs: [file("1")] },
      })

      expect(findCustomFields).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        ids: ["cf-docs"],
      })
      expect(setValues).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [{ customFieldId: "cf-name", value: "Alice" }],
        }),
      )
    })

    test("a response without file values looks no field up", async () => {
      await apply({
        fieldMappings: [{ paramKey: "name", customFieldId: "cf-name" }],
        flowResponse: { name: "Alice" },
      })

      expect(findCustomFields).not.toHaveBeenCalled()
      expect(setValues).toHaveBeenCalled()
    })

    test("a response ingested without files serializes as before", async () => {
      await apply({
        fieldMappings: [{ paramKey: "docs", customFieldId: "cf-1" }],
        flowResponse: { docs: [{ id: "1", file_name: "a.pdf" }] },
      })

      expect(setValues).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [
            {
              customFieldId: "cf-1",
              value: '[{"id":"1","file_name":"a.pdf"}]',
            },
          ],
        }),
      )
    })
  })

  describe("date answers", () => {
    const fieldTypes: Record<string, string> = {
      "cf-date": "date",
      "cf-datetime": "datetime",
      "cf-text": "shortText",
    }
    const saveAnswers = async (flowResponse: Record<string, unknown>) => {
      findCustomFields.mockImplementation(async ({ ids }: { ids: string[] }) =>
        ids.map((id) => ({ id, type: fieldTypes[id] ?? "shortText" })),
      )
      await whatsappFlowResponseService.applyResponse({
        workspaceId: "ws-1",
        contactId: "contact-1",
        integrationWhatsappId: "wa-1",
        flowSourceId: "meta-flow-1",
        fieldMappings: Object.keys(flowResponse).map((key) => ({
          paramKey: key,
          customFieldId: key,
        })),
        flowResponse,
      })
      return setValues.mock.calls.at(-1)?.[0]
    }

    // 2024-03-20T18:07:00Z, already 2024-03-21 in Ho Chi Minh City.
    const LATE_EVENING_UTC_MS = "1710958020000"

    test("a millisecond timestamp (DatePicker before 5.0) is the contact's local day in a date field", async () => {
      expect(await saveAnswers({ "cf-date": LATE_EVENING_UTC_MS })).toEqual(
        expect.objectContaining({
          fields: [{ customFieldId: "cf-date", value: "2024-03-21" }],
        }),
      )
    })

    test("a millisecond timestamp is the exact instant in a datetime field", async () => {
      expect(await saveAnswers({ "cf-datetime": LATE_EVENING_UTC_MS })).toEqual(
        expect.objectContaining({
          fields: [
            { customFieldId: "cf-datetime", value: "2024-03-20T18:07:00.000Z" },
          ],
        }),
      )
      expect(resolveTimezone).not.toHaveBeenCalled()
    })

    test("a calendar date is local midnight in a datetime field and kept in a date field", async () => {
      expect(
        await saveAnswers({
          "cf-datetime": "2024-10-21",
          "cf-date": "2024-10-21",
        }),
      ).toEqual(
        expect.objectContaining({
          fields: [
            { customFieldId: "cf-datetime", value: "2024-10-21T00:00:00" },
            { customFieldId: "cf-date", value: "2024-10-21" },
          ],
        }),
      )
    })

    test("an older timestamp (before 2001, before 1970) is a date too", async () => {
      // 1990-01-01T00:00:00Z and 1960-01-01T00:00:00Z.
      expect(
        await saveAnswers({
          "cf-date": "631152000000",
          "cf-datetime": "-315619200000",
        }),
      ).toEqual(
        expect.objectContaining({
          fields: [
            { customFieldId: "cf-date", value: "1990-01-01" },
            { customFieldId: "cf-datetime", value: "1960-01-01T00:00:00.000Z" },
          ],
        }),
      )
    })

    test.each([
      ["the epoch", "0", "1970-01-01T00:00:00.000Z"],
      ["a day after it", "86400000", "1970-01-02T00:00:00.000Z"],
      ["a day before it", "-86400000", "1969-12-31T00:00:00.000Z"],
    ])("a timestamp near %s is a date too", async (_label, ms, expected) => {
      expect(await saveAnswers({ "cf-datetime": ms })).toEqual(
        expect.objectContaining({
          fields: [{ customFieldId: "cf-datetime", value: expected }],
        }),
      )
    })

    test("a number past JavaScript's date range is left for the field to refuse", async () => {
      expect(await saveAnswers({ "cf-date": "9".repeat(17) })).toEqual(
        expect.objectContaining({
          fields: [{ customFieldId: "cf-date", value: "9".repeat(17) }],
        }),
      )
    })

    test("a number in a number field is untouched", async () => {
      fieldTypes["cf-number"] = "number"
      expect(await saveAnswers({ "cf-number": "5" })).toEqual(
        expect.objectContaining({
          fields: [{ customFieldId: "cf-number", value: "5" }],
        }),
      )
    })

    test("a timestamp's day is the business's (workspace) day, as Meta says", async () => {
      timezoneResolverInputs.length = 0
      await saveAnswers({ "cf-date": LATE_EVENING_UTC_MS })

      expect(timezoneResolverInputs).toEqual([
        expect.objectContaining({ workspaceId: "ws-1", strategy: "workspace" }),
      ])
    })

    test("a date-like answer in a text field is saved as it came", async () => {
      expect(await saveAnswers({ "cf-text": LATE_EVENING_UTC_MS })).toEqual(
        expect.objectContaining({
          fields: [{ customFieldId: "cf-text", value: LATE_EVENING_UTC_MS }],
        }),
      )
      expect(resolveTimezone).not.toHaveBeenCalled()
    })

    test("a date range (CalendarPicker) is saved as start - end", async () => {
      expect(
        await saveAnswers({
          "cf-text": { "start-date": "2024-10-21", "end-date": "2024-10-25" },
        }),
      ).toEqual(
        expect.objectContaining({
          fields: [
            { customFieldId: "cf-text", value: "2024-10-21 - 2024-10-25" },
          ],
        }),
      )
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
