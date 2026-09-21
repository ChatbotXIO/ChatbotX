import { describe, expect, test } from "vitest"
import {
  buildCreateBroadcastDefaultValues,
  buildEditBroadcastDefaultValues,
  type EditableBroadcastDraft,
} from "@/features/broadcasts/lib/create-broadcast-defaults"

describe("buildCreateBroadcastDefaultValues send limit fields", () => {
  test("seeds audienceRangeStart, audienceRangeEnd, and sendRatePerMinute as undefined", () => {
    const values = buildCreateBroadcastDefaultValues({})
    expect(values.audienceRangeStart).toBeUndefined()
    expect(values.audienceRangeEnd).toBeUndefined()
    expect(values.sendRatePerMinute).toBeUndefined()
  })
})

const baseDraft: EditableBroadcastDraft = {
  id: "b-1",
  channel: "telegram",
  subaction: "telegramAllContacts",
  flowId: "flow-1",
  templateId: null,
  integrationWhatsappId: null,
  integrationMessengerId: null,
  templateData: null,
  schedulesType: "now",
  schedulesAt: new Date("2026-01-01T00:00:00Z"),
  contactFilter: { operator: "and", conditions: [] },
  targets: [],
  integrationWhatsapp: null,
  integrationMessenger: null,
  audienceRangeStart: null,
  audienceRangeEnd: null,
  sendRatePerMinute: null,
} as unknown as EditableBroadcastDraft

describe("buildEditBroadcastDefaultValues send limit fields", () => {
  test("round-trips stored values onto the form", () => {
    const result = buildEditBroadcastDefaultValues({
      ...baseDraft,
      audienceRangeStart: 5,
      audienceRangeEnd: 500,
      sendRatePerMinute: 250,
    } as EditableBroadcastDraft)

    expect(result?.defaultValues.audienceRangeStart).toBe(5)
    expect(result?.defaultValues.audienceRangeEnd).toBe(500)
    expect(result?.defaultValues.sendRatePerMinute).toBe(250)
  })

  test("maps null stored values to undefined", () => {
    const result = buildEditBroadcastDefaultValues(baseDraft)

    expect(result?.defaultValues.audienceRangeStart).toBeUndefined()
    expect(result?.defaultValues.audienceRangeEnd).toBeUndefined()
    expect(result?.defaultValues.sendRatePerMinute).toBeUndefined()
  })
})
