import { describe, expect, test, vi } from "vitest"

// Item 3c of the field-value normalization plan flagged
// `apps/worker/src/integration/handlers/ref.ts` as writing
// `contactCustomFieldModel` directly (a data-access-rule violation) that
// would need refactoring onto `contactCustomFieldService`. On inspection the
// only such direct write in that file is inside a large commented-out block
// (dead code) — the LIVE reflink path (`handleReflink` -> `saveResultToCustomField`)
// already calls `contactCustomFieldService.setValues`, which already emits
// `customFieldChanged`. This test pins that: `saveResultToCustomField` never
// touches `contactCustomFieldModel`/`db` directly, so it automatically picks
// up the runtime coercion added to `normalizeCustomFieldValueForStorage`
// without any further change here.

const setValues = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  contactCustomFieldService: { setValues },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { contactCustomFieldModel: { findFirst: vi.fn() } },
  },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  getStoragePrefix: vi.fn(),
  uploader: {},
}))

vi.mock("../src/services/integrations", () => ({
  integrationService: { getIntegrationFromContactInbox: vi.fn() },
}))

const { saveResultToCustomField } = await import(
  "../src/integration/utils/contact"
)

describe("saveResultToCustomField", () => {
  test("delegates to contactCustomFieldService.setValues (no direct DB write)", async () => {
    await saveResultToCustomField({
      contactId: "contact-1",
      customFieldId: "cf-1",
      fullText: "yes",
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
    })

    expect(setValues).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInboxId: "ci-1",
      fields: [{ customFieldId: "cf-1", value: "yes" }],
    })
  })
})
