import { describe, expect, test } from "vitest"
import {
  actionSteps,
  sendMetaCapiEventDefaultFn,
  sendMetaCapiEventSchema,
  stepTypes,
} from "../src"

describe("Send Meta CAPI event flow contract", () => {
  test("accepts the default LeadSubmitted step", () => {
    expect(sendMetaCapiEventSchema.parse(sendMetaCapiEventDefaultFn())).toEqual(
      expect.objectContaining({
        stepType: "sendMetaCapiEvent",
        eventName: "LeadSubmitted",
      }),
    )
  })

  test("rejects the wrong step type", () => {
    expect(() =>
      sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        stepType: "sendText",
      }),
    ).toThrow()
  })

  test("rejects unsupported event names", () => {
    expect(() =>
      sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        eventName: "Purchase",
      }),
    ).toThrow()
  })

  test("accepts numeric value text", () => {
    expect(
      sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        value: "10.5",
      }).value,
    ).toBe("10.5")
  })

  test("rejects non-numeric value text", () => {
    expect(() =>
      sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        value: "abc",
      }),
    ).toThrow()
  })

  test("rejects invalid currency codes", () => {
    expect(() =>
      sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        currency: "US",
      }),
    ).toThrow()
  })

  test("normalizes currency codes to uppercase", () => {
    expect(
      sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        currency: "usd",
      }).currency,
    ).toBe("USD")
  })

  test("accepts optional content fields and clears blanks", () => {
    const parsed = sendMetaCapiEventSchema.parse({
      ...sendMetaCapiEventDefaultFn(),
      contentCategory: "Education",
      contentName: "",
    })

    expect(parsed.contentCategory).toBe("Education")
    expect(parsed.contentName).toBeUndefined()
  })

  test("rejects content fields over 200 characters", () => {
    expect(() =>
      sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        contentName: "x".repeat(201),
      }),
    ).toThrow()
  })

  test("treats cleared value and currency fields as unset", () => {
    const parsed = sendMetaCapiEventSchema.parse({
      ...sendMetaCapiEventDefaultFn(),
      value: "",
      currency: "   ",
    })

    expect(parsed.value).toBeUndefined()
    expect(parsed.currency).toBeUndefined()
  })

  test("creates safe defaults with success and error states", () => {
    const value = sendMetaCapiEventDefaultFn()

    expect(value).toMatchObject({
      stepType: "sendMetaCapiEvent",
      eventName: "LeadSubmitted",
    })
    expect(value.states.map((state) => state.stateType)).toEqual([
      "success",
      "error",
    ])
    expect(value.states.every((state) => Boolean(state.id))).toBe(true)
  })

  test("is registered in the step enum and shared action union", () => {
    const defaults = sendMetaCapiEventDefaultFn()

    expect(stepTypes.options).toContain("sendMetaCapiEvent")
    expect(
      actionSteps.some((schema) => schema.safeParse(defaults).success),
    ).toBe(true)
  })
})
