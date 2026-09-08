import { TemporalInputParsing } from "@chatbotx.io/utils/datetime"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Covers the opt-in `allowBotFields` routing added to `setValueByKey` /
// `deleteByKey` (packages/business/src/contact-custom-field/service.ts):
// capability is opt-in per caller, never ambient. Only when `allowBotFields`
// is true AND the keyword is a well-formed `bot_field:<id>` token does the
// call delegate to `botFieldService`; every other combination (flag off, or
// a plain id/name even with the flag on) must run the EXISTING contact-scoped
// path untouched.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  customFieldFindFirst: vi.fn(),
  applyValueOperation: vi.fn(async () => ({ id: "bot-1", value: "after" })),
  clearValueByKey: vi.fn(async () => ({ id: "bot-1", value: null })),
  invalidateCacheByTags: vi.fn(async () => undefined),
  emitCustomFieldChanged: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      customFieldModel: { findFirst: mocks.customFieldFindFirst },
    },
  },
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitCustomFieldChanged: mocks.emitCustomFieldChanged,
}))

vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

vi.mock("../src/bot-field/service", () => ({
  botFieldService: {
    applyValueOperation: mocks.applyValueOperation,
    clearValueByKey: mocks.clearValueByKey,
  },
}))

const { contactCustomFieldService } = await import(
  "../src/contact-custom-field/service"
)

describe("contactCustomFieldService.setValueByKey — bot-field routing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("allowBotFields:true + bot token routes to botFieldService with the operation, never touching the contact lookup", async () => {
    await contactCustomFieldService.setValueByKey({
      workspaceId: "ws-1",
      contactId: "contact-1",
      keyword: "bot_field:5",
      value: "42",
      operation: "O04",
      allowBotFields: true,
    })

    expect(mocks.applyValueOperation).toHaveBeenCalledTimes(1)
    expect(mocks.applyValueOperation).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      key: "5",
      operation: "O04",
      value: "42",
      sourceTimezoneOverride: undefined,
    })
    // No ContactCustomField row is ever touched for the bot-field branch.
    expect(mocks.customFieldFindFirst).not.toHaveBeenCalled()
  })

  test("allowBotFields:true + bot token defaults the operation to set when omitted", async () => {
    await contactCustomFieldService.setValueByKey({
      workspaceId: "ws-1",
      contactId: "contact-1",
      keyword: "bot_field:7",
      value: "hello",
      allowBotFields: true,
    })

    expect(mocks.applyValueOperation).toHaveBeenCalledWith(
      expect.objectContaining({ key: "7", operation: "O01", value: "hello" }),
    )
  })

  // Regression coverage for Finding 1: these two options are accepted on
  // `SetValueByKeyInput` but were previously dropped on the floor before
  // reaching `botFieldService.applyValueOperation`.
  test("forwards temporalInputParsing and fillEmptyTemporalWithNow to botFieldService.applyValueOperation", async () => {
    await contactCustomFieldService.setValueByKey({
      workspaceId: "ws-1",
      contactId: "contact-1",
      keyword: "bot_field:5",
      value: "",
      allowBotFields: true,
      temporalInputParsing: TemporalInputParsing.Lenient,
      fillEmptyTemporalWithNow: true,
    })

    expect(mocks.applyValueOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "5",
        value: "",
        temporalInputParsing: TemporalInputParsing.Lenient,
        fillEmptyTemporalWithNow: true,
      }),
    )
  })

  test("allowBotFields:true + plain id falls through to the legacy contact path, never touching botFieldService", async () => {
    mocks.customFieldFindFirst.mockResolvedValue({ id: "42" })
    const setValuesSpy = vi
      .spyOn(contactCustomFieldService, "setValues")
      .mockResolvedValue(undefined)

    await contactCustomFieldService.setValueByKey({
      workspaceId: "ws-1",
      contactId: "contact-1",
      keyword: "42",
      value: "hi",
      allowBotFields: true,
    })

    expect(mocks.applyValueOperation).not.toHaveBeenCalled()
    expect(setValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        contactId: "contact-1",
        fields: [{ customFieldId: "42", value: "hi" }],
      }),
    )

    setValuesSpy.mockRestore()
  })

  test("allowBotFields:false (default) + bot token falls through to legacy name-lookup and throws the existing notFound, never touching botFieldService", async () => {
    mocks.customFieldFindFirst.mockResolvedValue(undefined)

    await expect(
      contactCustomFieldService.setValueByKey({
        workspaceId: "ws-1",
        contactId: "contact-1",
        keyword: "bot_field:5",
        value: "42",
      }),
    ).rejects.toThrow()

    expect(mocks.applyValueOperation).not.toHaveBeenCalled()
  })
})

describe("contactCustomFieldService.deleteByKey — bot-field routing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("allowBotFields:true + bot token routes to botFieldService.clearValueByKey (nulls, doesn't delete a row), never touching the contact lookup", async () => {
    await contactCustomFieldService.deleteByKey({
      workspaceId: "ws-1",
      contactId: "contact-1",
      keyword: "bot_field:9",
      allowBotFields: true,
    })

    expect(mocks.clearValueByKey).toHaveBeenCalledTimes(1)
    expect(mocks.clearValueByKey).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      key: "9",
    })
    expect(mocks.customFieldFindFirst).not.toHaveBeenCalled()
  })

  test("allowBotFields:true + plain id/name falls through to the legacy contact delete path, never touching botFieldService", async () => {
    mocks.customFieldFindFirst.mockResolvedValue({ id: "cf-1", name: "Field" })
    const findValueSpy = vi
      .spyOn(contactCustomFieldService, "findValue")
      .mockResolvedValue(null)
    const deleteByCustomFieldIdSpy = vi
      .spyOn(contactCustomFieldService, "deleteByCustomFieldId")
      .mockResolvedValue(undefined)

    await contactCustomFieldService.deleteByKey({
      workspaceId: "ws-1",
      contactId: "contact-1",
      keyword: "Field",
      allowBotFields: true,
    })

    expect(mocks.clearValueByKey).not.toHaveBeenCalled()
    expect(deleteByCustomFieldIdSpy).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
      customFieldId: "cf-1",
    })

    findValueSpy.mockRestore()
    deleteByCustomFieldIdSpy.mockRestore()
  })

  test("allowBotFields:false (default) + bot token falls through to legacy name-lookup and throws the existing notFound, never touching botFieldService", async () => {
    mocks.customFieldFindFirst.mockResolvedValue(undefined)

    await expect(
      contactCustomFieldService.deleteByKey({
        workspaceId: "ws-1",
        contactId: "contact-1",
        keyword: "bot_field:9",
      }),
    ).rejects.toThrow()

    expect(mocks.clearValueByKey).not.toHaveBeenCalled()
  })

  /**
   * PUBLIC-API GUARANTEE: `contactsPublicRouter.clearCustomField`
   * (`apps/builder/src/features/contacts/api/public.ts`, DELETE
   * `/v1/contacts/{identifier}/custom-fields/{idOrName}`) calls
   * `deleteByKey({ workspaceId, contactId, keyword })` — it never sets
   * `allowBotFields`. This test pins that exact call shape (mirroring the
   * handler byte for byte, not just relying on the default-parameter
   * behavior above) so a public API token can never reach Account Fields,
   * which have no per-token scoping. A colocated route-level test would
   * require mocking the ~15 other modules `public.ts` imports (message
   * actions, contact-import service, tag queries, ...) for no additional
   * coverage over pinning the exact input shape here — see plan §3.2.
   */
  test("PUBLIC API GUARANTEE: the workspace-token contact custom-field DELETE handler's exact call shape (no allowBotFields) never clears a bot field for a bot_field:<id> token", async () => {
    mocks.customFieldFindFirst.mockResolvedValue(undefined)

    await expect(
      contactCustomFieldService.deleteByKey({
        workspaceId: "ws-1",
        contactId: "contact-1",
        keyword: "bot_field:9",
        // Deliberately no `allowBotFields` / `contactInboxId` — matches the
        // exact input object the workspace-token handler passes.
      }),
    ).rejects.toThrow()

    expect(mocks.clearValueByKey).not.toHaveBeenCalled()
  })
})
