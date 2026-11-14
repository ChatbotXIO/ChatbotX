import { describe, expect, test } from "vitest"
import { publicBroadcastResource } from "@/features/broadcasts/schema/resource"

describe("publicBroadcastResource send limit fields", () => {
  test("includes audienceRangeStart, audienceRangeEnd, and sendRatePerMinute", () => {
    expect(Object.keys(publicBroadcastResource.shape)).toEqual(
      expect.arrayContaining([
        "audienceRangeStart",
        "audienceRangeEnd",
        "sendRatePerMinute",
      ]),
    )
  })

  test("parses a row carrying send limit values", () => {
    const result = publicBroadcastResource.safeParse({
      id: "1",
      name: "Broadcast",
      status: "scheduled",
      schedulesType: "now",
      schedulesAt: new Date(),
      flowId: null,
      contactCount: null,
      audienceRangeStart: 1,
      audienceRangeEnd: 500,
      sendRatePerMinute: 250,
    })
    expect(result.success).toBe(true)
  })

  test("exposes channel, subaction, template, filter and targets", () => {
    const result = publicBroadcastResource.safeParse({
      id: "1",
      name: "Broadcast",
      status: "draft",
      schedulesType: "now",
      schedulesAt: new Date(),
      flowId: null,
      contactCount: null,
      audienceRangeStart: null,
      audienceRangeEnd: null,
      sendRatePerMinute: null,
      channel: "messenger",
      subaction: "messengerTemplateMessage",
      targetMode: "targets",
      templateId: "9",
      templateData: { params: [], buttons: [] },
      contactFilter: { operator: "and", conditions: [] },
      integrationWhatsappId: null,
      integrationMessengerId: null,
      targets: [
        {
          inboxId: "5",
          flowId: null,
          templateId: "9",
          templateData: null,
          inbox: { id: "5", name: "Page" },
          flow: null,
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(result.success && result.data.channel).toBe("messenger")
    expect(result.success && result.data.targets?.[0]?.inboxId).toBe("5")
  })
})

describe("publicBroadcastResource status reason", () => {
  const base = {
    id: "1",
    name: "Broadcast",
    status: "cancelled",
    schedulesType: "now",
    schedulesAt: new Date(),
    flowId: null,
    contactCount: 5,
    audienceRangeStart: null,
    audienceRangeEnd: null,
    sendRatePerMinute: null,
  }

  test("exposes the three status reason fields", () => {
    expect(Object.keys(publicBroadcastResource.shape)).toEqual(
      expect.arrayContaining([
        "statusReason",
        "statusErrorMessage",
        "statusInboxId",
      ]),
    )
  })

  test("parses a system-stopped broadcast and keeps the values", () => {
    const result = publicBroadcastResource.parse({
      ...base,
      statusReason: "accountSendRestricted",
      statusErrorMessage: "restricted",
      statusInboxId: "9",
    })
    expect(result.statusReason).toBe("accountSendRestricted")
    expect(result.statusErrorMessage).toBe("restricted")
    expect(result.statusInboxId).toBe("9")
  })

  test("a customer-stopped broadcast has null reason fields", () => {
    const result = publicBroadcastResource.parse({
      ...base,
      statusReason: null,
      statusErrorMessage: null,
      statusInboxId: null,
    })
    expect(result.statusReason).toBeNull()
  })
})
