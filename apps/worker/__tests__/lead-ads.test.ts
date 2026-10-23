import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mock references
// ---------------------------------------------------------------------------

const {
  mockIdentify,
  mockFindMatching,
  mockIncrementLeadsHandled,
  mockClaim,
  mockRelease,
  mockSetContactId,
  mockSetFormName,
  mockGetLeadgenFormName,
  mockSetRichSystemFieldByKey,
  mockContactUpdate,
  mockSetValueByKey,
  mockGetLead,
  mockDetect,
} = vi.hoisted(() => ({
  mockIdentify: vi.fn(),
  mockFindMatching: vi.fn(),
  mockIncrementLeadsHandled: vi.fn(),
  mockClaim: vi.fn(),
  mockRelease: vi.fn(),
  mockSetContactId: vi.fn(),
  mockSetFormName: vi.fn(),
  mockGetLeadgenFormName: vi.fn(),
  mockSetRichSystemFieldByKey: vi.fn(),
  mockContactUpdate: vi.fn(),
  mockSetValueByKey: vi.fn(),
  mockGetLead: vi.fn(),
  mockDetect: vi.fn(),
}))

const RICH_FIELDS = [
  "phone",
  "phone_number",
  "email",
  "full_name",
  "first_name",
  "last_name",
]

vi.mock("@chatbotx.io/business", () => ({
  isRichSystemContactField: (name: string) => RICH_FIELDS.includes(name),
  contactService: {
    setRichSystemFieldByKey: mockSetRichSystemFieldByKey,
    update: mockContactUpdate,
  },
  contactCustomFieldService: { setValueByKey: mockSetValueByKey },
  facebookLeadAdsAutomationService: {
    findMatching: mockFindMatching,
    incrementLeadsHandled: mockIncrementLeadsHandled,
  },
  facebookLeadAdsLeadService: {
    claim: mockClaim,
    release: mockRelease,
    setContactId: mockSetContactId,
    setFormName: mockSetFormName,
  },
}))

vi.mock("@chatbotx.io/integration-messenger/apis/leadgen", () => ({
  getLead: mockGetLead,
  getLeadgenFormName: mockGetLeadgenFormName,
}))

vi.mock("../src/services/integrations", () => ({
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: mockIdentify,
  },
}))

vi.mock("../src/integration/handlers/received-message", () => ({
  detectContactAndConversation: mockDetect,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const mockLogProviderError = vi.fn()
vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: (...args: unknown[]) => mockLogProviderError(...args),
}))

const { processLeadgen } = await import("../src/integration/handlers/lead-ads")

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const JOB = {
  integrationType: "messenger",
  integrationIdentifier: "page-1",
  leadgenId: "lead-1",
  formId: "form-1",
  adgroupId: "adgroup-1",
}

/**
 * `defaultJobOptions.attempts` is 2. The handler only writes an `ErrorLog` row
 * once the retries are spent, so the default fixture is the final attempt.
 */
const bullJob = (attemptsMade = 1) =>
  ({ attemptsMade, opts: { attempts: 2 } }) as never

const INBOX = { id: "inbox-1", workspaceId: "ws-1", channel: "messenger" }
const INTEGRATION_ROW = {
  id: "int-1",
  auth: {
    tokens: { accessToken: "page-token" },
    metadata: { version: "v23.0" },
  },
}

const INBOX_URL =
  "https://business.facebook.com/latest/26669534262722585?nav_ref=thread_view_by_psid"

function leadWith(fields: Array<{ name: string; values: string[] }>) {
  return {
    id: "lead-1",
    created_time: "2026-07-23T13:30:50+0000",
    field_data: fields,
  }
}

function primeResolvers() {
  mockIdentify.mockResolvedValue({
    inbox: INBOX,
    integrationRow: INTEGRATION_ROW,
  })
  mockClaim.mockResolvedValue({ id: "claim-1" })
  mockDetect.mockResolvedValue({
    contact: { id: "contact-1" },
    contactInbox: { id: "ci-1" },
    conversation: { id: "conv-1" },
    isNewContact: false,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processLeadgen", () => {
  test("no matching automation: does nothing", async () => {
    mockIdentify.mockResolvedValue({
      inbox: INBOX,
      integrationRow: INTEGRATION_ROW,
    })
    mockFindMatching.mockResolvedValue(undefined)

    await processLeadgen(JOB, bullJob())

    expect(mockClaim).not.toHaveBeenCalled()
    expect(mockGetLead).not.toHaveBeenCalled()
    expect(mockIncrementLeadsHandled).not.toHaveBeenCalled()
  })

  test("dedup: a re-delivered lead (claim returns null) is a no-op", async () => {
    mockIdentify.mockResolvedValue({
      inbox: INBOX,
      integrationRow: INTEGRATION_ROW,
    })
    mockFindMatching.mockResolvedValue({
      id: "auto-1",
      fieldMapping: [],
    })
    mockClaim.mockResolvedValue(null)

    await processLeadgen(JOB, bullJob())

    expect(mockGetLead).not.toHaveBeenCalled()
    expect(mockDetect).not.toHaveBeenCalled()
    expect(mockIncrementLeadsHandled).not.toHaveBeenCalled()
  })

  test("failure after the claim: releases it and rethrows so the retry reprocesses", async () => {
    primeResolvers()
    mockFindMatching.mockResolvedValue({
      id: "auto-1",
      fieldMapping: [],
    })
    mockGetLead.mockRejectedValue(new Error("graph 500"))

    await expect(processLeadgen(JOB, bullJob())).rejects.toThrow("graph 500")

    expect(mockRelease).toHaveBeenCalledWith({ id: "claim-1" })
    expect(mockIncrementLeadsHandled).not.toHaveBeenCalled()
  })

  test("failure after the claim: a failing release does not mask the original error", async () => {
    primeResolvers()
    mockFindMatching.mockResolvedValue({
      id: "auto-1",
      fieldMapping: [],
    })
    mockGetLead.mockResolvedValue(
      leadWith([{ name: "inbox_url", values: [INBOX_URL] }]),
    )
    mockDetect.mockRejectedValue(new Error("mac quota exceeded"))
    mockRelease.mockRejectedValue(new Error("db down"))

    await expect(processLeadgen(JOB, bullJob())).rejects.toThrow(
      "mac quota exceeded",
    )

    expect(mockRelease).toHaveBeenCalledWith({ id: "claim-1" })
  })

  // `attempts: 2` means an ungated log would write two rows for one logical
  // failure — the same double-count the terminal-only rule elsewhere avoids.
  test("failure on a non-final attempt: no error-log row until retries are spent", async () => {
    primeResolvers()
    mockFindMatching.mockResolvedValue({
      id: "auto-1",
      fieldMapping: [],
    })
    mockGetLead.mockRejectedValue(new Error("graph 500"))

    await expect(processLeadgen(JOB, bullJob(0))).rejects.toThrow("graph 500")

    expect(mockLogProviderError).not.toHaveBeenCalled()
    expect(mockRelease).toHaveBeenCalledWith({ id: "claim-1" })
  })

  test("failure on the final attempt: writes one error-log row", async () => {
    primeResolvers()
    mockFindMatching.mockResolvedValue({
      id: "auto-1",
      fieldMapping: [],
    })
    mockGetLead.mockRejectedValue(new Error("graph 500"))

    await expect(processLeadgen(JOB, bullJob())).rejects.toThrow("graph 500")

    expect(mockLogProviderError).toHaveBeenCalledTimes(1)
    expect(mockLogProviderError).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "facebook-ads",
        workspaceId: "ws-1",
      }),
    )
  })

  test("no inbox_url: skips contact creation and counter", async () => {
    primeResolvers()
    mockFindMatching.mockResolvedValue({
      id: "auto-1",
      fieldMapping: [],
    })
    mockGetLead.mockResolvedValue(
      leadWith([{ name: "email", values: ["a@b.com"] }]),
    )

    await processLeadgen(JOB, bullJob())

    expect(mockDetect).not.toHaveBeenCalled()
    expect(mockIncrementLeadsHandled).not.toHaveBeenCalled()
  })

  test("specific-form mapping: routes system vs custom targets and counts", async () => {
    primeResolvers()
    mockFindMatching.mockResolvedValue({
      id: "auto-1",
      fieldMapping: [
        { key: "email", label: "Email", type: "EMAIL", target: "email" },
        { key: "phone_number", label: "Phone", type: "PHONE", target: "phone" },
        { key: "salary", label: "Salary", type: "CUSTOM", target: "12345" },
      ],
    })
    mockGetLead.mockResolvedValue(
      leadWith([
        { name: "inbox_url", values: [INBOX_URL] },
        { name: "email", values: ["a@b.com"] },
        { name: "phone_number", values: ["+234701"] },
        { name: "salary", values: ["1000"] },
      ]),
    )

    await processLeadgen(JOB, bullJob())

    expect(mockSetRichSystemFieldByKey).toHaveBeenCalledWith(
      expect.objectContaining({ fieldName: "email", value: "a@b.com" }),
    )
    expect(mockSetRichSystemFieldByKey).toHaveBeenCalledWith(
      expect.objectContaining({ fieldName: "phone", value: "+234701" }),
    )
    expect(mockSetValueByKey).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: "12345", value: "1000" }),
    )
    expect(mockSetContactId).toHaveBeenCalledWith({
      id: "claim-1",
      contactId: "contact-1",
    })
    expect(mockIncrementLeadsHandled).toHaveBeenCalledWith("auto-1")
  })

  test("all-forms: auto-maps standard fields (incl. gender) and counts", async () => {
    primeResolvers()
    mockFindMatching.mockResolvedValue({
      id: "auto-1",
      fieldMapping: [],
    })
    mockGetLead.mockResolvedValue(
      leadWith([
        { name: "inbox_url", values: [INBOX_URL] },
        { name: "email", values: ["a@b.com"] },
        { name: "phone_number", values: ["+234701"] },
        { name: "gender", values: ["male"] },
      ]),
    )

    await processLeadgen(JOB, bullJob())

    expect(mockSetRichSystemFieldByKey).toHaveBeenCalledWith(
      expect.objectContaining({ fieldName: "email" }),
    )
    expect(mockSetRichSystemFieldByKey).toHaveBeenCalledWith(
      expect.objectContaining({ fieldName: "phone" }),
    )
    expect(mockContactUpdate).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "contact-1" },
      { gender: "male" },
    )
    expect(mockIncrementLeadsHandled).toHaveBeenCalledWith("auto-1")
  })

  test("claims the lead with the form and adgroup ids and the automation's form name", async () => {
    primeResolvers()
    mockFindMatching.mockResolvedValue({
      id: "auto-1",
      formName: "Summer promo",
      fieldMapping: [],
    })
    mockGetLead.mockResolvedValue(
      leadWith([{ name: "inbox_url", values: [INBOX_URL] }]),
    )

    await processLeadgen(JOB, bullJob())

    expect(mockClaim).toHaveBeenCalledWith({
      automationId: "auto-1",
      leadgenId: "lead-1",
      formId: "form-1",
      formName: "Summer promo",
      adgroupId: "adgroup-1",
    })
    expect(mockGetLeadgenFormName).not.toHaveBeenCalled()
    expect(mockSetFormName).not.toHaveBeenCalled()
  })

  test("all-forms automation: looks the form name up from the page's forms", async () => {
    primeResolvers()
    mockFindMatching.mockResolvedValue({
      id: "auto-1",
      formName: null,
      fieldMapping: [],
    })
    mockGetLead.mockResolvedValue(
      leadWith([{ name: "inbox_url", values: [INBOX_URL] }]),
    )
    mockGetLeadgenFormName.mockResolvedValue("Winter promo")

    await processLeadgen(JOB, bullJob())

    expect(mockGetLeadgenFormName).toHaveBeenCalledWith(
      "page-1",
      "form-1",
      "page-token",
      "v23.0",
    )
    expect(mockSetFormName).toHaveBeenCalledWith({
      id: "claim-1",
      formName: "Winter promo",
    })
    expect(mockIncrementLeadsHandled).toHaveBeenCalledWith("auto-1")
  })

  test("all-forms automation: a form the page does not list stores nothing", async () => {
    primeResolvers()
    mockFindMatching.mockResolvedValue({
      id: "auto-1",
      formName: null,
      fieldMapping: [],
    })
    mockGetLead.mockResolvedValue(
      leadWith([{ name: "inbox_url", values: [INBOX_URL] }]),
    )
    mockGetLeadgenFormName.mockResolvedValue(undefined)

    await processLeadgen(JOB, bullJob())

    expect(mockSetFormName).not.toHaveBeenCalled()
    expect(mockIncrementLeadsHandled).toHaveBeenCalledWith("auto-1")
  })

  test("all-forms automation: a failing form lookup never fails the lead", async () => {
    primeResolvers()
    mockFindMatching.mockResolvedValue({
      id: "auto-1",
      formName: null,
      fieldMapping: [],
    })
    mockGetLead.mockResolvedValue(
      leadWith([{ name: "inbox_url", values: [INBOX_URL] }]),
    )
    mockGetLeadgenFormName.mockRejectedValue(new Error("graph #200"))

    await expect(processLeadgen(JOB, bullJob())).resolves.toBeUndefined()

    expect(mockSetFormName).not.toHaveBeenCalled()
    expect(mockRelease).not.toHaveBeenCalled()
    expect(mockIncrementLeadsHandled).toHaveBeenCalledWith("auto-1")
  })
})
