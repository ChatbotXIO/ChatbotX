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
  mockSetRichSystemFieldByKey,
  mockContactUpdate,
  mockSetValueByKey,
  mockGetLead,
  mockDetect,
  mockRunFlowNode,
} = vi.hoisted(() => ({
  mockIdentify: vi.fn(),
  mockFindMatching: vi.fn(),
  mockIncrementLeadsHandled: vi.fn(),
  mockClaim: vi.fn(),
  mockRelease: vi.fn(),
  mockSetContactId: vi.fn(),
  mockSetRichSystemFieldByKey: vi.fn(),
  mockContactUpdate: vi.fn(),
  mockSetValueByKey: vi.fn(),
  mockGetLead: vi.fn(),
  mockDetect: vi.fn(),
  mockRunFlowNode: vi.fn(),
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
  },
}))

vi.mock("@chatbotx.io/integration-messenger/apis/leadgen", () => ({
  getLead: mockGetLead,
}))

vi.mock("../src/services/integrations", () => ({
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: mockIdentify,
  },
}))

vi.mock("../src/integration/handlers/received-message", () => ({
  detectContactAndConversation: mockDetect,
}))

vi.mock("../src/integration/handlers/flow", () => ({
  runFlowNode: mockRunFlowNode,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
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
}

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

    await processLeadgen(JOB)

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
      flowId: null,
    })
    mockClaim.mockResolvedValue(null)

    await processLeadgen(JOB)

    expect(mockGetLead).not.toHaveBeenCalled()
    expect(mockDetect).not.toHaveBeenCalled()
    expect(mockRunFlowNode).not.toHaveBeenCalled()
    expect(mockIncrementLeadsHandled).not.toHaveBeenCalled()
  })

  test("failure after the claim: releases it and rethrows so the retry reprocesses", async () => {
    primeResolvers()
    mockFindMatching.mockResolvedValue({
      id: "auto-1",
      fieldMapping: [],
      flowId: "flow-9",
    })
    mockGetLead.mockRejectedValue(new Error("graph 500"))

    await expect(processLeadgen(JOB)).rejects.toThrow("graph 500")

    expect(mockRelease).toHaveBeenCalledWith({ id: "claim-1" })
    expect(mockIncrementLeadsHandled).not.toHaveBeenCalled()
  })

  test("failure after the claim: a failing release does not mask the original error", async () => {
    primeResolvers()
    mockFindMatching.mockResolvedValue({
      id: "auto-1",
      fieldMapping: [],
      flowId: null,
    })
    mockGetLead.mockResolvedValue(
      leadWith([{ name: "inbox_url", values: [INBOX_URL] }]),
    )
    mockDetect.mockRejectedValue(new Error("mac quota exceeded"))
    mockRelease.mockRejectedValue(new Error("db down"))

    await expect(processLeadgen(JOB)).rejects.toThrow("mac quota exceeded")

    expect(mockRelease).toHaveBeenCalledWith({ id: "claim-1" })
  })

  test("no inbox_url: skips contact creation, flow, and counter", async () => {
    primeResolvers()
    mockFindMatching.mockResolvedValue({
      id: "auto-1",
      fieldMapping: [],
      flowId: "flow-9",
    })
    mockGetLead.mockResolvedValue(
      leadWith([{ name: "email", values: ["a@b.com"] }]),
    )

    await processLeadgen(JOB)

    expect(mockDetect).not.toHaveBeenCalled()
    expect(mockRunFlowNode).not.toHaveBeenCalled()
    expect(mockIncrementLeadsHandled).not.toHaveBeenCalled()
  })

  test("specific-form mapping: routes system vs custom targets, sends flow, counts", async () => {
    primeResolvers()
    mockFindMatching.mockResolvedValue({
      id: "auto-1",
      flowId: "flow-9",
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

    await processLeadgen(JOB)

    expect(mockSetRichSystemFieldByKey).toHaveBeenCalledWith(
      expect.objectContaining({ fieldName: "email", value: "a@b.com" }),
    )
    expect(mockSetRichSystemFieldByKey).toHaveBeenCalledWith(
      expect.objectContaining({ fieldName: "phone", value: "+234701" }),
    )
    expect(mockSetValueByKey).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: "12345", value: "1000" }),
    )
    expect(mockRunFlowNode).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: "flow-9" }),
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
      flowId: null,
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

    await processLeadgen(JOB)

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
    // No flow configured → not sent, but the lead is still counted.
    expect(mockRunFlowNode).not.toHaveBeenCalled()
    expect(mockIncrementLeadsHandled).toHaveBeenCalledWith("auto-1")
  })
})
