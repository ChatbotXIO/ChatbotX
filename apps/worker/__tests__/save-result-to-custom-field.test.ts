import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Covers `saveResultToCustomField` (apps/worker/src/integration/utils/
// contact.ts) — the shared save-target used by every AI/result step handler
// (analyze-image, edit-image, extract-data, generate-image, generate-text,
// generate-text-agent, speech-to-text, text-to-speech, and the referral
// ref.ts handler). It must forward through `setValueByKey` with
// `allowBotFields: true` so a step configured to save into an Account Field
// (`bot_field:<id>` token) resolves the same way "Set Custom Field" does,
// while a plain ContactCustomField id/name keeps working unchanged. The
// bot-field-vs-customField ROUTING decision itself lives in
// `contactCustomFieldService.setValueByKey` (packages/business), so this test
// only asserts the worker forwards both reference shapes verbatim.
// ---------------------------------------------------------------------------

const setValueByKey = vi.fn(async () => undefined)

vi.mock("@chatbotx.io/business", () => ({
  contactCustomFieldService: { setValueByKey },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { contactInboxModel: { findFirst: vi.fn() } } },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  getStoragePrefix: vi.fn(() => "prefix"),
  uploader: {},
}))

vi.mock("../src/services/integrations", () => ({
  integrationService: { getIntegrationFromContactInbox: vi.fn() },
}))

const { saveResultToCustomField } = await import(
  "../src/integration/utils/contact"
)

describe("saveResultToCustomField", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("forwards a plain ContactCustomField id through setValueByKey with allowBotFields", async () => {
    await saveResultToCustomField({
      contactId: "c-1",
      customFieldId: "42",
      fullText: "hello world",
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
    })

    expect(setValueByKey).toHaveBeenCalledTimes(1)
    expect(setValueByKey).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      keyword: "42",
      value: "hello world",
      contactInboxId: "ci-1",
      allowBotFields: true,
    })
  })

  test("forwards a bot_field: reference token unchanged", async () => {
    await saveResultToCustomField({
      contactId: "c-1",
      customFieldId: "bot_field:9",
      fullText: "extracted value",
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
    })

    expect(setValueByKey).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: "bot_field:9",
        value: "extracted value",
        allowBotFields: true,
      }),
    )
  })

  test("threads a missing contactInboxId through as undefined", async () => {
    await saveResultToCustomField({
      contactId: "c-1",
      customFieldId: "legacy-name",
      fullText: "value",
      workspaceId: "ws-1",
    })

    expect(setValueByKey).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: "legacy-name",
        contactInboxId: undefined,
      }),
    )
  })

  test("propagates a non-notFound rejection from the service instead of swallowing it", async () => {
    setValueByKey.mockRejectedValueOnce(new Error("connection reset"))

    await expect(
      saveResultToCustomField({
        contactId: "c-1",
        customFieldId: "bot_field:999",
        fullText: "value",
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow("connection reset")
  })

  // Back-compat: the pre-bot-field `setValues` path silently skipped a
  // since-deleted field id (the step completed as success). A notFound from
  // `setValueByKey` must be swallowed to preserve that, while other errors
  // (previous test) still propagate.
  test("swallows a notFound rejection so a flow pointing at a deleted field keeps succeeding", async () => {
    const { ChatbotXException } = await import("@chatbotx.io/business/errors")
    setValueByKey.mockRejectedValueOnce(
      new ChatbotXException("Custom field not found", "notFound", 404),
    )

    await expect(
      saveResultToCustomField({
        contactId: "c-1",
        customFieldId: "42",
        fullText: "value",
        workspaceId: "ws-1",
      }),
    ).resolves.toBeUndefined()
  })
})
