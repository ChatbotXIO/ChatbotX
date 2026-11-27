import { describe, expect, test } from "vitest"
import { getCtwaFunnelInput } from "../src/ads-conversion/schema"

describe("getCtwaFunnelInput", () => {
  test("rejects an inverted UTC date range", () => {
    const result = getCtwaFunnelInput.safeParse({
      workspaceId: "1",
      since: new Date("2026-08-11T00:00:00.000Z"),
      until: new Date("2026-08-10T23:59:59.999Z"),
    })

    expect(result.success).toBe(false)
  })

  test("accepts an optional WhatsApp integration filter", () => {
    const result = getCtwaFunnelInput.safeParse({
      workspaceId: "1",
      integrationWhatsappId: "9",
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
    })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ integrationWhatsappId: "9" })
  })

  test("accepts allChannels with no integration id", () => {
    const result = getCtwaFunnelInput.safeParse({
      workspaceId: "1",
      allChannels: true,
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
    })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ allChannels: true })
  })

  test("accepts an optional viewer timezone, unset by default", () => {
    const withoutTz = getCtwaFunnelInput.safeParse({
      workspaceId: "1",
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
    })
    expect(withoutTz.success).toBe(true)
    expect(withoutTz.data?.timezone).toBeUndefined()

    const withTz = getCtwaFunnelInput.safeParse({
      workspaceId: "1",
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
      timezone: "Asia/Saigon",
    })
    expect(withTz.success).toBe(true)
    expect(withTz.data).toMatchObject({ timezone: "Asia/Saigon" })
  })

  test.each([
    ["integrationWhatsappId", { integrationWhatsappId: "1" }],
    ["integrationMessengerId", { integrationMessengerId: "1" }],
    ["integrationInstagramId", { integrationInstagramId: "1" }],
  ])("rejects allChannels combined with %s", (_label, integrationField) => {
    const result = getCtwaFunnelInput.safeParse({
      workspaceId: "1",
      allChannels: true,
      ...integrationField,
      since: new Date("2026-08-10T00:00:00.000Z"),
      until: new Date("2026-08-11T23:59:59.999Z"),
    })

    expect(result.success).toBe(false)
  })

  test("accepts a list of integration ids for one channel", () => {
    const result = getCtwaFunnelInput.safeParse({
      workspaceId: "1",
      since: "2026-08-01T00:00:00.000Z",
      until: "2026-08-10T00:00:00.000Z",
      channel: "messenger",
      integrationIds: ["10", "11"],
    })

    expect(result.success).toBe(true)
  })

  test("rejects an integration id list without a channel (it could span channels)", () => {
    const result = getCtwaFunnelInput.safeParse({
      workspaceId: "1",
      since: "2026-08-01T00:00:00.000Z",
      until: "2026-08-10T00:00:00.000Z",
      integrationIds: ["10"],
    })

    expect(result.success).toBe(false)
  })

  test("rejects allChannels combined with an integration id list", () => {
    const result = getCtwaFunnelInput.safeParse({
      workspaceId: "1",
      since: "2026-08-01T00:00:00.000Z",
      until: "2026-08-10T00:00:00.000Z",
      channel: "messenger",
      allChannels: true,
      integrationIds: ["10"],
    })

    expect(result.success).toBe(false)
  })

  test("rejects a non-numeric integration id", () => {
    const result = getCtwaFunnelInput.safeParse({
      workspaceId: "1",
      since: "2026-08-01T00:00:00.000Z",
      until: "2026-08-10T00:00:00.000Z",
      channel: "messenger",
      integrationIds: ["10; DROP TABLE"],
    })

    expect(result.success).toBe(false)
  })
})
