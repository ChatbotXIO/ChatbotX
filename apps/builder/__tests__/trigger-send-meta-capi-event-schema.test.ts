import { describe, expect, test } from "vitest"
import {
  defaultFn,
  sendMetaCapiEvent,
} from "@/features/triggers/components/actions/schema/send-meta-capi-event"

describe("trigger send Meta CAPI event action schema", () => {
  test("rejects Purchase without value or currency", () => {
    const result = sendMetaCapiEvent.safeParse({
      ...defaultFn(),
      eventName: "Purchase",
    })

    expect(result.success).toBe(false)
  })

  test("accepts Purchase with both value and currency", () => {
    const result = sendMetaCapiEvent.safeParse({
      ...defaultFn(),
      eventName: "Purchase",
      value: "10",
      currency: "USD",
    })

    expect(result.success).toBe(true)
  })

  test("applies defaults for a stored action with only the old five fields", () => {
    const result = sendMetaCapiEvent.safeParse({
      type: "sendMetaCapiEvent",
      eventName: "LeadSubmitted",
      value: "10",
      currency: "USD",
      contentCategory: "Education",
      contentName: "Course",
    })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      actionSource: "business_messaging",
      eventName: "LeadSubmitted",
      value: "10",
      currency: "USD",
      contentCategory: "Education",
      contentName: "Course",
    })
  })

  test("accepts a custom event name for the email action source", () => {
    const result = sendMetaCapiEvent.safeParse({
      ...defaultFn(),
      actionSource: "email",
      eventName: "my-custom-event",
    })

    expect(result.success).toBe(true)
  })

  test("rejects a pixel-only event name (Lead) for business_messaging", () => {
    const result = sendMetaCapiEvent.safeParse({
      ...defaultFn(),
      actionSource: "business_messaging",
      eventName: "Lead",
    })

    expect(result.success).toBe(false)
  })

  test("defaultFn() parses", () => {
    const result = sendMetaCapiEvent.safeParse(defaultFn())

    expect(result.success).toBe(true)
  })
})
