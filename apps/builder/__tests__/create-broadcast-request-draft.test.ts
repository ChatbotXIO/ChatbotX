import { describe, expect, test } from "vitest"
import { createBroadcastRequest } from "@/features/broadcasts/schema/action"

const base = {
  channel: "telegram",
  flowId: "1",
  subaction: "allContacts",
  schedulesType: "now",
  schedulesAt: null,
  contactFilter: { operator: "and", conditions: [] },
}

describe("createBroadcastRequest.saveAsDraft", () => {
  test("defaults to undefined and accepts true", () => {
    expect(createBroadcastRequest.parse(base).saveAsDraft).toBeUndefined()
    expect(
      createBroadcastRequest.parse({ ...base, saveAsDraft: true }).saveAsDraft,
    ).toBe(true)
  })

  test("rejects non-boolean values", () => {
    expect(
      createBroadcastRequest.safeParse({ ...base, saveAsDraft: "yes" }).success,
    ).toBe(false)
  })
})

describe("createBroadcastRequest.schedulesAt", () => {
  test("rejects a future time whose minute-start is not after now", () => {
    // 20s into the *current* minute rounds down (startOfMinute) to a value
    // that is what actually gets persisted — so it must fail validation
    // too. Anchored to the current minute boundary (rather than
    // `Date.now() + 20_000`) so the assertion is not flaky when the test
    // happens to run in the last 20s of a minute.
    const startOfCurrentMinuteMs = Math.floor(Date.now() / 60_000) * 60_000
    const schedulesAt = new Date(startOfCurrentMinuteMs + 20_000).toISOString()
    const result = createBroadcastRequest.safeParse({
      ...base,
      schedulesType: "future",
      schedulesAt,
    })
    expect(result.success).toBe(false)
  })

  test("accepts a time at least 1 minute ahead", () => {
    const schedulesAt = new Date(Date.now() + 90_000).toISOString()
    const result = createBroadcastRequest.safeParse({
      ...base,
      schedulesType: "future",
      schedulesAt,
    })
    expect(result.success).toBe(true)
  })
})

describe("createBroadcastRequest.targets", () => {
  const templateBase = {
    channel: "whatsapp",
    subaction: "whatsappTemplateMessage",
    schedulesType: "now",
    schedulesAt: null,
    contactFilter: { operator: "and", conditions: [] },
  }

  test("accepts one template per page and treats it as a template send", () => {
    const result = createBroadcastRequest.safeParse({
      ...templateBase,
      targets: [
        { inboxId: "1", templateId: "10", templateData: { body: [] } },
        { inboxId: "2", templateId: "20" },
      ],
    })
    expect(result.success).toBe(true)
  })

  test("allows a page left without a template as long as another page has one", () => {
    const result = createBroadcastRequest.safeParse({
      ...templateBase,
      targets: [{ inboxId: "1", templateId: "10" }, { inboxId: "2" }],
    })
    expect(result.success).toBe(true)
  })

  test("rejects a targets-form template send where NOT ONE page has a template", () => {
    // A legacy top-level `templateId` (left over before the broadcast had
    // pages) makes `broadcastSendsTemplate` true even though every target is
    // empty — `isTargetsTemplateSendWithoutTemplate` catches that case.
    const result = createBroadcastRequest.safeParse({
      ...templateBase,
      templateId: "legacy",
      targets: [{ inboxId: "1" }, { inboxId: "2" }],
    })
    expect(result.success).toBe(false)
    expect(
      result.error?.issues.some(
        (issue) => issue.message === "Select a template for at least one page",
      ),
    ).toBe(true)
  })

  test("rejects the same page selected twice", () => {
    const result = createBroadcastRequest.safeParse({
      ...templateBase,
      targets: [
        { inboxId: "1", templateId: "10" },
        { inboxId: "1", templateId: "11" },
      ],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      "A page can only be selected once",
    )
  })

  test("rejects a template that names no page (neither a target nor a legacy integration)", () => {
    const result = createBroadcastRequest.safeParse({
      ...templateBase,
      templateId: "10",
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      "Select the page the template belongs to",
    )
  })

  test("accepts a legacy single-page template scoped by its integration id", () => {
    const result = createBroadcastRequest.safeParse({
      ...templateBase,
      templateId: "10",
      integrationWhatsappId: "77",
    })
    expect(result.success).toBe(true)
  })

  test("rejects a payload that names both a flow and a template", () => {
    const result = createBroadcastRequest.safeParse({
      ...templateBase,
      flowId: "5",
      targets: [{ inboxId: "1", templateId: "10" }],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      "A broadcast sends either a flow or a template, not both",
    )
  })

  test("still requires a flow or a template when no page carries one", () => {
    const result = createBroadcastRequest.safeParse({
      ...templateBase,
      targets: [{ inboxId: "1" }],
    })
    expect(result.success).toBe(false)
  })

  test("accepts one flow per page on a flow send", () => {
    const result = createBroadcastRequest.safeParse({
      ...templateBase,
      targets: [
        { inboxId: "1", flowId: "5" },
        { inboxId: "2", flowId: "6" },
      ],
    })
    expect(result.success).toBe(true)
  })

  test("allows a page left without a flow as long as another page has one", () => {
    const result = createBroadcastRequest.safeParse({
      ...templateBase,
      targets: [{ inboxId: "1", flowId: "5" }, { inboxId: "2" }],
    })
    expect(result.success).toBe(true)
  })

  test("rejects a stale top-level flowId combined with pages that all carry no flow", () => {
    // A legacy top-level `flowId` (left over before the broadcast had pages)
    // makes `broadcastSendsFlow` true even though every target is empty —
    // `isTargetsFlowSendWithoutFlow` catches that case.
    const result = createBroadcastRequest.safeParse({
      ...templateBase,
      flowId: "5",
      targets: [{ inboxId: "1" }, { inboxId: "2" }],
    })
    expect(result.success).toBe(false)
    expect(
      result.error?.issues.some(
        (issue) => issue.message === "Select a flow for at least one page",
      ),
    ).toBe(true)
  })

  test("runs the WhatsApp send-param rules for every page", () => {
    const result = createBroadcastRequest.safeParse({
      ...templateBase,
      targets: [
        { inboxId: "1", templateId: "10", templateData: { body: [] } },
        {
          inboxId: "2",
          templateId: "20",
          templateData: {
            body: [],
            limited_time_offer: { expiration_time_ms: 0 },
          },
        },
      ],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path.slice(0, 3)).toEqual([
      "targets",
      1,
      "templateData",
    ])
  })
})
