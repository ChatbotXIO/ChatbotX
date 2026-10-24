import {
  dateTimeTriggerTypes,
  operatorTypes,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { updateTriggerSchema } from "../../triggers/schema/mutation"
import { updateWebhookRequest } from "../../webhooks/schema/update-webhook-schema"
import { conditionSchema } from "../schema"
import { customFieldValueChanged } from "../schema/custom-field-value-changed"
import { dateTimeBasedTrigger } from "../schema/date-time-based-trigger"

describe("dateTimeBasedTrigger schema timezone", () => {
  test("preserves the editor-captured timezone on the value object", () => {
    // The `value` is a typed `z.object()`, which strips unknown keys. The
    // timezone must be declared in the schema or it never reaches the DB.
    const parsed = dateTimeBasedTrigger.parse({
      type: triggerEventTypes.enum.dateTimeBasedTrigger,
      sourceId: "cf-1",
      operator: operatorTypes.enum.eq,
      value: {
        triggerType: dateTimeTriggerTypes.enum.before,
        timeValue: 2,
        timeType: "days",
        timezone: "Asia/Ho_Chi_Minh",
      },
    })

    expect(parsed.value.timezone).toBe("Asia/Ho_Chi_Minh")
  })

  test("stays valid for legacy conditions saved before timezone capture", () => {
    const parsed = dateTimeBasedTrigger.parse({
      type: triggerEventTypes.enum.dateTimeBasedTrigger,
      sourceId: "cf-1",
      operator: operatorTypes.enum.eq,
      value: {
        triggerType: dateTimeTriggerTypes.enum.atTheDayOf,
        at: "9",
      },
    })

    expect(parsed.value.timezone).toBeUndefined()
  })

  test("rejects an over-long timezone string at the boundary", () => {
    const result = dateTimeBasedTrigger.safeParse({
      type: triggerEventTypes.enum.dateTimeBasedTrigger,
      sourceId: "cf-1",
      operator: operatorTypes.enum.eq,
      value: {
        triggerType: dateTimeTriggerTypes.enum.before,
        timeValue: 2,
        timeType: "days",
        timezone: "A".repeat(65),
      },
    })

    expect(result.success).toBe(false)
  })
})

describe("customFieldValueChanged schema timezone", () => {
  test("passes the { text, timezone } value through unchanged", () => {
    // `value` is `z.unknown()`, so the whole payload is carried verbatim — this
    // is why the schema needed no edit to thread the captured timezone through.
    const value = {
      text: "2026-07-11T03:00:00.000Z",
      timezone: "Asia/Ho_Chi_Minh",
    }

    const parsed = customFieldValueChanged.parse({
      type: triggerEventTypes.enum.customFieldValueChanged,
      sourceId: "cf-1",
      operator: operatorTypes.enum.eq,
      value,
    })

    expect(parsed.value).toEqual(value)
  })
})

describe("catalog and call conditions", () => {
  const CATALOG_TYPES = [
    triggerEventTypes.enum.shoppingCartSent,
    triggerEventTypes.enum.userAskedAboutProduct,
    triggerEventTypes.enum.productOrdered,
    triggerEventTypes.enum.productAddedToCart,
    triggerEventTypes.enum.productRemovedFromCart,
    // Pinned to a category instead of a product, same rules.
    triggerEventTypes.enum.categoryAddedToCart,
  ] as const
  const CALL_TYPES = [
    triggerEventTypes.enum.incomingCall,
    triggerEventTypes.enum.missedAudioCall,
    triggerEventTypes.enum.callEnded,
    triggerEventTypes.enum.callRecorded,
    triggerEventTypes.enum.callTranscribed,
  ] as const

  test.each(
    CALL_TYPES,
  )("accepts the %s condition the picker offers", (type) => {
    expect(conditionSchema.parse({ type })).toEqual({ type })
  })

  test.each(
    CATALOG_TYPES,
  )("%s: an omitted, null or empty product all mean 'any product' (null)", (type) => {
    for (const input of [
      { type },
      { type, sourceId: null },
      { type, sourceId: "" },
    ]) {
      expect(conditionSchema.parse(input)).toEqual({ type, sourceId: null })
    }
  })

  test.each(CATALOG_TYPES)("%s: keeps a product id", (type) => {
    expect(
      conditionSchema.parse({ type, sourceId: "123456789012345678" }),
    ).toEqual({ type, sourceId: "123456789012345678" })
  })

  test.each(
    CATALOG_TYPES,
  )("%s: rejects a product id that is not an id", (type) => {
    expect(conditionSchema.safeParse({ type, sourceId: "shoe" }).success).toBe(
      false,
    )
  })

  test.each(
    CATALOG_TYPES,
  )("%s: rejects a product id too long for a bigint column", (type) => {
    expect(
      conditionSchema.safeParse({ type, sourceId: "9".repeat(19) }).success,
    ).toBe(false)
    expect(
      conditionSchema.safeParse({ type, sourceId: "9".repeat(18) }).success,
    ).toBe(true)
  })

  test.each([
    triggerEventTypes.enum.newOrder,
    triggerEventTypes.enum.orderAccepted,
    triggerEventTypes.enum.orderShipped,
    triggerEventTypes.enum.orderConcluded,
    triggerEventTypes.enum.orderCancelled,
    triggerEventTypes.enum.cartAbandoned,
  ])("accepts the %s store event, which takes no other field", (type) => {
    expect(conditionSchema.parse({ type })).toEqual({ type })
  })

  test("still rejects a condition type nothing emits", () => {
    expect(conditionSchema.safeParse({ type: "ticketCreated" }).success).toBe(
      false,
    )
  })

  // The trigger form, the server actions and both public APIs validate with
  // these two schemas, so a condition they reject cannot be saved anywhere.
  test.each([
    ["triggers", updateTriggerSchema, { actions: [] }],
    ["webhooks", updateWebhookRequest, { url: "https://example.com/hook" }],
  ] as const)("%s accept the new conditions on save", (_name, schema, rest) => {
    const parsed = schema.safeParse({
      ...rest,
      conditions: [
        { type: triggerEventTypes.enum.shoppingCartSent, sourceId: "" },
        { type: triggerEventTypes.enum.userAskedAboutProduct },
        { type: triggerEventTypes.enum.incomingCall },
      ],
    })

    expect(parsed.success).toBe(true)
    expect(parsed.data?.conditions).toEqual([
      { type: "shoppingCartSent", sourceId: null },
      { type: "userAskedAboutProduct", sourceId: null },
      { type: "incomingCall" },
    ])
  })
})
