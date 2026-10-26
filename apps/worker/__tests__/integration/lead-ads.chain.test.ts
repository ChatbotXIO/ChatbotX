import { createHmac } from "node:crypto"
import { db } from "@chatbotx.io/database/client"
import { ALL_FORMS_ID } from "@chatbotx.io/database/partials"
import { facebookLeadAdsAutomationModel } from "@chatbotx.io/database/schema"
import { integration as messengerIntegration } from "@chatbotx.io/integration-messenger"
import { createId } from "@chatbotx.io/utils"
import type { IntegrationJobProcessLeadgen } from "@chatbotx.io/worker-config"
import type { Job } from "bullmq"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import {
  assertThrowawayDatabase,
  closeDatabase,
  hasThrowawayDatabase,
} from "./support/real-database"
import { renderForContact } from "./support/render"
import {
  numericId,
  seedContact,
  seedMessengerChannel,
  seedWorkspace,
  uniq,
} from "./support/seed"

// Only the outbound Graph calls are stubbed; webhook parsing, the job, the
// claim, the contact lookup and every write run for real on the throwaway DB.
const graph = vi.hoisted(() => ({
  getLead: vi.fn(),
  getLeadgenFormName: vi.fn(),
}))
vi.mock("@chatbotx.io/integration-messenger/apis/leadgen", () => ({
  getLead: graph.getLead,
  getLeadgenFormName: graph.getLeadgenFormName,
}))

const CLIENT_SECRET = "e2e-secret"
const LEAD_TEMPLATE =
  "[{{last_lead_id}}]/[{{last_form_id}}]/[{{last_form_name}}]/[{{last_adgroup_id}}]"

const finalAttemptJob = { attemptsMade: 1, opts: { attempts: 2 } } as Job

type LeadgenValue = {
  leadgen_id: string
  form_id: string
  page_id: string
  created_time?: number
  ad_id?: string
  adgroup_id?: string
}

/** A signed Meta `leadgen` webhook delivered to the real messenger handler. */
const deliverLeadgenWebhook = async (
  pageId: string,
  value: LeadgenValue,
): Promise<IntegrationJobProcessLeadgen["data"][]> => {
  const body = JSON.stringify({
    object: "page",
    entry: [
      {
        id: pageId,
        time: 1_792_751_096_000,
        changes: [{ field: "leadgen", value }],
      },
    ],
  })
  const signature = `sha256=${createHmac("sha256", CLIENT_SECRET).update(body).digest("hex")}`
  const queued: IntegrationJobProcessLeadgen["data"][] = []
  const queue = {
    add: vi.fn((name: string, job: { data: unknown }) => {
      if (name === "processLeadgen") {
        queued.push(job.data as IntegrationJobProcessLeadgen["data"])
      }
      return Promise.resolve()
    }),
  }

  await messengerIntegration.handleRequest({
    config: { clientSecret: CLIENT_SECRET, verifyToken: "verify" },
    req: new Request(
      "https://example.test/api/integrations/messenger/webhook",
      {
        method: "POST",
        headers: { "x-hub-signature-256": signature },
        body,
      },
    ),
    queue,
  } as never)

  return queued
}

const leadResponse = (psid: string | null) => ({
  id: "lead",
  created_time: "2026-10-23T08:00:00+0000",
  field_data: [
    ...(psid
      ? [
          {
            name: "inbox_url",
            values: [
              `https://business.facebook.com/latest/${psid}?nav_ref=test`,
            ],
          },
        ]
      : []),
    { name: "full_name", values: ["Ada Lead"] },
  ],
})

type World = Awaited<ReturnType<typeof buildWorld>>

const buildWorld = async () => {
  const { workspace } = await seedWorkspace()
  const pageId = numericId()
  const channel = await seedMessengerChannel(workspace.id, pageId)
  const psid = numericId()
  const contact = await seedContact({
    workspaceId: workspace.id,
    inboxId: channel.inboxId,
    channel: "messenger",
    sourceId: psid,
    firstName: "Ada",
  })
  return { workspaceId: workspace.id, pageId, psid, contact }
}

const seedAutomation = async (
  world: World,
  input: { formId: string; formName: string | null },
) => {
  const id = createId()
  await db.insert(facebookLeadAdsAutomationModel).values({
    id,
    name: uniq("automation"),
    workspaceId: world.workspaceId,
    pageId: world.pageId,
    pageName: "Page",
    formId: input.formId,
    formName: input.formName,
    fieldMapping: [],
  })
  return id
}

const leadRows = (world: World) =>
  db.query.facebookLeadAdsLeadModel.findMany({
    where: { contactId: world.contact.contactId },
    orderBy: { createdAt: "asc" },
  })

const automationCounter = async (id: string) =>
  (
    await db.query.facebookLeadAdsAutomationModel.findFirst({
      where: { id },
    })
  )?.leadsHandledCount

const render = (world: World) =>
  renderForContact({
    contactId: world.contact.contactId,
    contactInboxId: world.contact.contactInboxId,
    text: LEAD_TEMPLATE,
  })

describe.skipIf(!hasThrowawayDatabase())(
  "Messenger Lead Ads: signed webhook to stored lead to rendered variables",
  () => {
    beforeAll(assertThrowawayDatabase)
    afterAll(closeDatabase)
    beforeEach(() => {
      graph.getLead.mockReset()
      graph.getLeadgenFormName.mockReset()
    })

    const run = async (
      world: World,
      value: Partial<LeadgenValue> & Pick<LeadgenValue, "leadgen_id">,
    ) => {
      const { processLeadgen } = await import(
        "../../src/integration/handlers/lead-ads"
      )
      const jobs = await deliverLeadgenWebhook(world.pageId, {
        form_id: "8001",
        page_id: world.pageId,
        ...value,
      })
      for (const data of jobs) {
        await processLeadgen(data, finalAttemptJob)
      }
      return jobs
    }

    test("specific-form automation: stores form, form name and adgroup, then renders them", async () => {
      const world = await buildWorld()
      const automationId = await seedAutomation(world, {
        formId: "8001",
        formName: "Specific Form",
      })
      graph.getLead.mockResolvedValue(leadResponse(world.psid))

      const jobs = await run(world, {
        leadgen_id: "7001",
        ad_id: "6001",
        adgroup_id: "6002",
      })

      // What the webhook handler put on the queue.
      expect(jobs).toEqual([
        {
          integrationType: "messenger",
          integrationIdentifier: world.pageId,
          leadgenId: "7001",
          formId: "8001",
          adgroupId: "6002",
        },
      ])
      const rows = await leadRows(world)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        automationId,
        contactId: world.contact.contactId,
        leadgenId: "7001",
        formId: "8001",
        formName: "Specific Form",
        adgroupId: "6002",
      })
      expect(await automationCounter(automationId)).toBe(1)
      expect(graph.getLeadgenFormName).not.toHaveBeenCalled()
      expect(await render(world)).toBe("[7001]/[8001]/[Specific Form]/[6002]")
    })

    test("falls back to ad_id when the webhook carries no adgroup_id", async () => {
      const world = await buildWorld()
      await seedAutomation(world, { formId: "8001", formName: "Specific Form" })
      graph.getLead.mockResolvedValue(leadResponse(world.psid))

      await run(world, { leadgen_id: "7002", ad_id: "6001" })

      expect((await leadRows(world))[0]?.adgroupId).toBe("6001")
      expect(await render(world)).toBe("[7002]/[8001]/[Specific Form]/[6001]")
    })

    test("a job queued before the new fields existed stores nulls and renders blanks", async () => {
      const world = await buildWorld()
      await seedAutomation(world, { formId: "8001", formName: "Specific Form" })
      graph.getLead.mockResolvedValue(leadResponse(world.psid))
      const { processLeadgen } = await import(
        "../../src/integration/handlers/lead-ads"
      )

      await processLeadgen(
        {
          integrationType: "messenger",
          integrationIdentifier: world.pageId,
          leadgenId: "7003",
          formId: "8001",
        },
        finalAttemptJob,
      )

      expect((await leadRows(world))[0]?.adgroupId).toBeNull()
      expect(await render(world)).toBe("[7003]/[8001]/[Specific Form]/[]")
    })

    test("all-forms automation: reads the form name from the page's forms", async () => {
      const world = await buildWorld()
      const automationId = await seedAutomation(world, {
        formId: ALL_FORMS_ID,
        formName: null,
      })
      graph.getLead.mockResolvedValue(leadResponse(world.psid))
      graph.getLeadgenFormName.mockResolvedValue("Graph Form")

      await run(world, { leadgen_id: "7004", adgroup_id: "6002" })

      expect(graph.getLeadgenFormName).toHaveBeenCalledWith(
        world.pageId,
        "8001",
        "page-token",
        "v23.0",
      )
      expect((await leadRows(world))[0]?.formName).toBe("Graph Form")
      expect(await automationCounter(automationId)).toBe(1)
      expect(await render(world)).toBe("[7004]/[8001]/[Graph Form]/[6002]")
    })

    test("all-forms automation: a failing form lookup still stores the lead", async () => {
      const world = await buildWorld()
      const automationId = await seedAutomation(world, {
        formId: ALL_FORMS_ID,
        formName: null,
      })
      graph.getLead.mockResolvedValue(leadResponse(world.psid))
      graph.getLeadgenFormName.mockRejectedValue(new Error("graph #200"))

      await run(world, { leadgen_id: "7005", adgroup_id: "6002" })

      const [row] = await leadRows(world)
      expect(row).toMatchObject({ leadgenId: "7005", formName: null })
      expect(await automationCounter(automationId)).toBe(1)
      expect(await render(world)).toBe("[7005]/[8001]/[]/[6002]")
    })

    test("a duplicate delivery is a no-op: one lead, counter 1", async () => {
      const world = await buildWorld()
      const automationId = await seedAutomation(world, {
        formId: "8001",
        formName: "Specific Form",
      })
      graph.getLead.mockResolvedValue(leadResponse(world.psid))

      await run(world, { leadgen_id: "7006", adgroup_id: "6002" })
      await run(world, { leadgen_id: "7006", adgroup_id: "6002" })

      expect(await leadRows(world)).toHaveLength(1)
      expect(await automationCounter(automationId)).toBe(1)
      expect(graph.getLead).toHaveBeenCalledTimes(1)
    })

    test("a failing lead fetch releases the claim, and the retry then stores exactly one lead", async () => {
      const world = await buildWorld()
      const automationId = await seedAutomation(world, {
        formId: "8001",
        formName: "Specific Form",
      })
      graph.getLead.mockRejectedValueOnce(new Error("graph 500"))
      graph.getLead.mockResolvedValue(leadResponse(world.psid))

      await expect(
        run(world, { leadgen_id: "7007", adgroup_id: "6002" }),
      ).rejects.toThrow("graph 500")
      // Checked by automation, not by contact: a leaked claim has no contact.
      expect(
        await db.query.facebookLeadAdsLeadModel.findMany({
          where: { automationId },
        }),
      ).toHaveLength(0)
      expect(await automationCounter(automationId)).toBe(0)

      await run(world, { leadgen_id: "7007", adgroup_id: "6002" })

      expect(await leadRows(world)).toHaveLength(1)
      expect(await automationCounter(automationId)).toBe(1)
      expect(await render(world)).toBe("[7007]/[8001]/[Specific Form]/[6002]")
    })

    test("a lead without a PSID keeps its claim, links no contact and renders blanks", async () => {
      const world = await buildWorld()
      const automationId = await seedAutomation(world, {
        formId: "8001",
        formName: "Specific Form",
      })
      graph.getLead.mockResolvedValue(leadResponse(null))

      await run(world, { leadgen_id: "7008", adgroup_id: "6002" })

      const claimed = await db.query.facebookLeadAdsLeadModel.findMany({
        where: { automationId },
      })
      expect(claimed).toHaveLength(1)
      expect(claimed[0]).toMatchObject({ leadgenId: "7008", contactId: null })
      expect(await automationCounter(automationId)).toBe(0)
      expect(await render(world)).toBe("[]/[]/[]/[]")
    })

    test("two leads of one contact: the newest wins, column by column from that row", async () => {
      const world = await buildWorld()
      await seedAutomation(world, { formId: "8001", formName: "Old Form" })
      await seedAutomation(world, { formId: "8002", formName: "New Form" })
      graph.getLead.mockResolvedValue(leadResponse(world.psid))

      await run(world, {
        leadgen_id: "7009",
        form_id: "8001",
        adgroup_id: "6001",
      })
      await new Promise((resolve) => setTimeout(resolve, 15))
      await run(world, {
        leadgen_id: "7010",
        form_id: "8002",
        adgroup_id: "6002",
      })

      expect(await leadRows(world)).toHaveLength(2)
      expect(await render(world)).toBe("[7010]/[8002]/[New Form]/[6002]")
    })

    test("another workspace's lead never leaks into this contact", async () => {
      const mine = await buildWorld()
      const theirs = await buildWorld()
      await seedAutomation(mine, { formId: "8001", formName: "Mine" })
      await seedAutomation(theirs, { formId: "8001", formName: "Theirs" })
      graph.getLead.mockImplementation(async (leadgenId: string) =>
        leadResponse(leadgenId === "7011" ? mine.psid : theirs.psid),
      )

      await run(mine, { leadgen_id: "7011", adgroup_id: "6001" })
      await run(theirs, { leadgen_id: "7012", adgroup_id: "6002" })

      expect(await render(mine)).toBe("[7011]/[8001]/[Mine]/[6001]")
      expect(await render(theirs)).toBe("[7012]/[8001]/[Theirs]/[6002]")
    })

    test("a webhook value with a wrongly typed id is dropped: no job, no lead", async () => {
      const world = await buildWorld()
      await seedAutomation(world, { formId: "8001", formName: "Specific Form" })
      graph.getLead.mockResolvedValue(leadResponse(world.psid))

      const jobs = await deliverLeadgenWebhook(world.pageId, {
        leadgen_id: 7014 as unknown as string,
        form_id: "8001",
        page_id: world.pageId,
      })

      expect(jobs).toHaveLength(0)
      expect(graph.getLead).not.toHaveBeenCalled()
      expect(await leadRows(world)).toHaveLength(0)
    })

    test("unknown extra fields in the webhook value are ignored", async () => {
      const world = await buildWorld()
      await seedAutomation(world, { formId: "8001", formName: "Specific Form" })
      graph.getLead.mockResolvedValue(leadResponse(world.psid))

      const jobs = await deliverLeadgenWebhook(world.pageId, {
        leadgen_id: "7015",
        form_id: "8001",
        page_id: world.pageId,
        unknown_extra: "ignored",
      } as LeadgenValue)

      expect(jobs).toHaveLength(1)
      expect(jobs[0]).toEqual({
        integrationType: "messenger",
        integrationIdentifier: world.pageId,
        leadgenId: "7015",
        formId: "8001",
      })
    })

    test("concurrent duplicate deliveries store one lead and bump the counter once", async () => {
      const world = await buildWorld()
      const automationId = await seedAutomation(world, {
        formId: "8001",
        formName: "Specific Form",
      })
      graph.getLead.mockResolvedValue(leadResponse(world.psid))

      await Promise.all([
        run(world, { leadgen_id: "7016", adgroup_id: "6002" }),
        run(world, { leadgen_id: "7016", adgroup_id: "6002" }),
        run(world, { leadgen_id: "7016", adgroup_id: "6002" }),
      ])

      expect(await leadRows(world)).toHaveLength(1)
      expect(await automationCounter(automationId)).toBe(1)
      expect(graph.getLead).toHaveBeenCalledTimes(1)
    })

    test("a specific-form automation wins over an all-forms one for the same page", async () => {
      const world = await buildWorld()
      const specificId = await seedAutomation(world, {
        formId: "8001",
        formName: "Specific Form",
      })
      const allFormsId = await seedAutomation(world, {
        formId: ALL_FORMS_ID,
        formName: null,
      })
      graph.getLead.mockResolvedValue(leadResponse(world.psid))

      await run(world, { leadgen_id: "7017", adgroup_id: "6002" })

      expect(await automationCounter(specificId)).toBe(1)
      expect(await automationCounter(allFormsId)).toBe(0)
      expect(graph.getLeadgenFormName).not.toHaveBeenCalled()
      expect(await render(world)).toBe("[7017]/[8001]/[Specific Form]/[6002]")
    })

    test("a lead from another form falls back to the all-forms automation and resolves the name", async () => {
      const world = await buildWorld()
      const specificId = await seedAutomation(world, {
        formId: "8001",
        formName: "Specific Form",
      })
      const allFormsId = await seedAutomation(world, {
        formId: ALL_FORMS_ID,
        formName: null,
      })
      graph.getLead.mockResolvedValue(leadResponse(world.psid))
      graph.getLeadgenFormName.mockImplementation(
        (_pageId: string, formId: string) =>
          Promise.resolve(formId === "8999" ? "Other Form" : undefined),
      )

      await run(world, {
        leadgen_id: "7018",
        form_id: "8999",
        adgroup_id: "6002",
      })

      expect(graph.getLeadgenFormName).toHaveBeenCalledWith(
        world.pageId,
        "8999",
        expect.anything(),
        expect.anything(),
      )
      expect(await automationCounter(specificId)).toBe(0)
      expect(await automationCounter(allFormsId)).toBe(1)
      expect(await render(world)).toBe("[7018]/[8999]/[Other Form]/[6002]")
    })

    test("precedence holds whichever automation was created first", async () => {
      const world = await buildWorld()
      const allFormsId = await seedAutomation(world, {
        formId: ALL_FORMS_ID,
        formName: null,
      })
      const specificId = await seedAutomation(world, {
        formId: "8001",
        formName: "Specific Form",
      })
      graph.getLead.mockResolvedValue(leadResponse(world.psid))

      await run(world, { leadgen_id: "7019", adgroup_id: "6002" })

      expect(await automationCounter(specificId)).toBe(1)
      expect(await automationCounter(allFormsId)).toBe(0)
    })

    test("a newest lead with no form name or adgroup renders blanks, not the older lead's", async () => {
      const world = await buildWorld()
      await seedAutomation(world, { formId: "8001", formName: "Old Form" })
      await seedAutomation(world, { formId: ALL_FORMS_ID, formName: null })
      graph.getLead.mockResolvedValue(leadResponse(world.psid))
      graph.getLeadgenFormName.mockResolvedValue(undefined)

      await run(world, {
        leadgen_id: "7020",
        form_id: "8001",
        adgroup_id: "6001",
      })
      await new Promise((resolve) => setTimeout(resolve, 15))
      await run(world, { leadgen_id: "7021", form_id: "8002" })

      expect(await render(world)).toBe("[7021]/[8002]/[]/[]")
    })

    test("a page with no matching automation stores nothing and never calls Graph", async () => {
      const world = await buildWorld()

      const jobs = await run(world, { leadgen_id: "7013", adgroup_id: "6001" })

      expect(jobs).toHaveLength(1)
      expect(graph.getLead).not.toHaveBeenCalled()
      expect(await leadRows(world)).toHaveLength(0)
      expect(await render(world)).toBe("[]/[]/[]/[]")
    })
  },
)
