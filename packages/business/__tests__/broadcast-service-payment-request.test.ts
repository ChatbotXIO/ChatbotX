import { beforeEach, describe, expect, test, vi } from "vitest"

// Import isolation only: these tests call `requireTemplateName` with the
// template lookup stubbed, so no collaborator below is ever exercised.
vi.mock("@chatbotx.io/worker-config", () => ({
  ScheduleJobData: {},
  broadcastDraftPurgeJobId: vi.fn(),
  scheduleQueue: { add: vi.fn() },
}))

vi.mock("@chatbotx.io/analytics", () => ({
  broadcastAnalyticsService: {},
  sequenceAnalyticsService: {},
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: {} },
  and: vi.fn(),
  asc: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  findOrFail: vi.fn(),
  gt: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
  ne: vi.fn(),
  or: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {},
  broadcastTargetModel: {},
  contactInboxModel: {},
  contactModel: {},
  contactsOnBroadcastsModel: {},
  conversationModel: {},
  integrationMessengerModel: {},
  integrationWhatsappModel: {},
  messengerMessageTemplateModel: {},
  whatsappMessageTemplateModel: {},
}))

vi.mock("@chatbotx.io/database/queries", () => ({
  buildContactInboxContactFilterSQL: vi.fn(),
  contactInboxInteractedWithin24hSQL: vi.fn(),
  pruneEmailPhoneFilterConditions: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  broadcastRecurrenceRepository: {},
  broadcastRepository: {},
}))

vi.mock("@chatbotx.io/flow-config", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  findTemplateStartStep: vi.fn(),
}))

vi.mock("../src/inbox/service", () => ({ inboxService: {} }))
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))
vi.mock("../src/broadcast/recurrence.service", () => ({
  broadcastRecurrenceService: {},
}))
vi.mock("../src/broadcast/plan-policy.service", () => ({
  broadcastPlanPolicyService: {},
}))

const { broadcastService } = await import("../src/broadcast/service")

const pixButton = {
  type: "PAYMENT_REQUEST",
  text: "Copy Pix code",
  payment_setting: { type: "pix_dynamic_code" },
}
const boletoButton = { type: "PAYMENT_REQUEST", text: "Copy Boleto code" }

const templateRow = (buttons: Record<string, unknown>[]) => ({
  id: "tpl-1",
  name: "pay",
  language: "pt_BR",
  category: "UTILITY",
  status: "APPROVED",
  components: [{ type: "BUTTONS", buttons }],
  inboxId: "inbox-a",
  integrationName: "Page A",
  channel: "whatsapp",
})

const paymentParams = (payment_request: Record<string, string>) => ({
  button: [{ sub_type: "payment_request", index: 0, payment_request }],
})

type RequireTemplateName = (input: {
  workspaceId: string
  channel: string
  selections: Array<{
    templateId: string
    inboxId: string
    templateData?: Record<string, unknown> | null
  }>
}) => Promise<string>

describe("broadcastService — payment request vs. template buttons", () => {
  const requireTemplateName = (
    templateData: Record<string, unknown> | null | undefined,
    channel = "whatsapp",
  ) =>
    (
      broadcastService as unknown as {
        requireTemplateName: RequireTemplateName
      }
    ).requireTemplateName({
      workspaceId: "ws-1",
      channel,
      selections: [{ templateId: "tpl-1", inboxId: "inbox-a", templateData }],
    })

  const loadTemplates = (buttons: Record<string, unknown>[]) =>
    vi
      .spyOn(
        broadcastService as unknown as {
          resolveSelectedTemplates: () => Promise<unknown[]>
        },
        "resolveSelectedTemplates",
      )
      .mockResolvedValue([templateRow(buttons)])

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  test("accepts a payment request that matches its template button", async () => {
    loadTemplates([pixButton])

    await expect(
      requireTemplateName(paymentParams({ method: "pix", code: "{{pix}}" })),
    ).resolves.toBe("Page A - pay")
  })

  test("rejects a request for another payment method", async () => {
    loadTemplates([boletoButton])

    await expect(
      requireTemplateName(paymentParams({ method: "pix", code: "x" })),
    ).rejects.toMatchObject({ field: "templateId" })
  })

  test("rejects a missing request for a template payment button", async () => {
    loadTemplates([pixButton])

    await expect(requireTemplateName({ button: [] })).rejects.toMatchObject({
      field: "templateId",
    })
  })

  test("rejects payment data for a template without payment buttons", async () => {
    loadTemplates([{ type: "QUICK_REPLY", text: "Later" }])

    await expect(
      requireTemplateName(paymentParams({ method: "pix", code: "x" })),
    ).rejects.toMatchObject({ field: "templateId" })
  })

  test("params left out for a payment template are rejected, not failed per recipient", async () => {
    loadTemplates([pixButton])

    await expect(requireTemplateName(undefined)).rejects.toMatchObject({
      field: "templateId",
    })
    await expect(requireTemplateName(null)).rejects.toMatchObject({
      field: "templateId",
    })
  })

  test("a template without payment buttons needs no params", async () => {
    loadTemplates([{ type: "QUICK_REPLY", text: "Later" }])

    await expect(requireTemplateName(undefined)).resolves.toBe("Page A - pay")
    await expect(requireTemplateName(null)).resolves.toBe("Page A - pay")
  })

  test("params that do not parse are left to the other validators", async () => {
    loadTemplates([pixButton])

    await expect(requireTemplateName({ button: "not-a-list" })).resolves.toBe(
      "Page A - pay",
    )
  })

  test("only WhatsApp broadcasts are checked", async () => {
    loadTemplates([pixButton])

    await expect(
      requireTemplateName(
        paymentParams({ method: "boleto", digitableLine: "1" }),
        "messenger",
      ),
    ).resolves.toBe("Page A - pay")
  })

  test("an unapproved template is still refused first", async () => {
    vi.spyOn(
      broadcastService as unknown as {
        resolveSelectedTemplates: () => Promise<unknown[]>
      },
      "resolveSelectedTemplates",
    ).mockResolvedValue([{ ...templateRow([pixButton]), status: "PENDING" }])

    await expect(
      requireTemplateName(paymentParams({ method: "pix", code: "x" })),
    ).rejects.toThrow("Template is not approved")
  })
})
