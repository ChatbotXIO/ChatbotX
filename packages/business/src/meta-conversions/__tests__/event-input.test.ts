import { describe, expect, test } from "vitest"
import { splitContentIds } from "../event-input"
import { enqueueEventInput } from "../schema"

// `enqueueEventInput` validates a value/currency/contentIds that a worker has
// already resolved from templates, so it must never itself perform
// destructive normalization ("12,50" is ambiguous between 12.50 and 1250, so
// it is rejected, not silently reinterpreted) and must reject an unresolved
// `{{...}}` template that leaked through.

function baseInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    workspaceId: "ws-1",
    channel: "messenger",
    contactInboxId: "ci-1",
    inboxId: "inbox-1",
    sourceKey: "flow:step-1:ci-1:key",
    source: "flowStep",
    ...overrides,
  }
}

describe("enqueueEventInput — value", () => {
  test.each([
    "1250000",
    "12.5",
  ])("accepts canonical numeric value %s", (value) => {
    const result = enqueueEventInput.parse(baseInput({ value }))
    expect(result.value).toBe(value)
  })

  test("trims surrounding whitespace without altering digits", () => {
    const result = enqueueEventInput.parse(baseInput({ value: " 12.50 " }))
    expect(result.value).toBe("12.50")
  })

  test.each([
    ["12,50", "comma decimal separator"],
    ["1,250", "comma thousands separator"],
    ["$12", "currency symbol"],
    ["{{x}}", "unresolved template placeholder"],
  ])("rejects %s (%s)", (value) => {
    expect(() => enqueueEventInput.parse(baseInput({ value }))).toThrow()
  })
})

describe("enqueueEventInput — currency", () => {
  test("trims and uppercases a valid ISO-4217 code", () => {
    const result = enqueueEventInput.parse(baseInput({ currency: " vnd " }))
    expect(result.currency).toBe("VND")
  })

  test("rejects a code that is not exactly 3 letters", () => {
    expect(() =>
      enqueueEventInput.parse(baseInput({ currency: "VN" })),
    ).toThrow()
  })
})

describe("splitContentIds", () => {
  test("splits, trims, and drops empty segments", () => {
    expect(splitContentIds("a, b ,,c")).toEqual(["a", "b", "c"])
  })

  test("returns undefined for an empty string", () => {
    expect(splitContentIds("")).toBeUndefined()
  })

  test("returns undefined for a blank string", () => {
    expect(splitContentIds("   ")).toBeUndefined()
  })
})

describe("enqueueEventInput — contentIds preprocessing", () => {
  test("parses a comma-separated string into a string[]", () => {
    const result = enqueueEventInput.parse(
      baseInput({ contentIds: "a, b ,,c" }),
    )
    expect(result.contentIds).toEqual(["a", "b", "c"])
  })

  test("omits contentIds when the input is blank", () => {
    const result = enqueueEventInput.parse(baseInput({ contentIds: "" }))
    expect(result.contentIds).toBeUndefined()
  })
})

describe("enqueueEventInput — Purchase value/currency requirement", () => {
  test("rejects Purchase without value", () => {
    expect(() =>
      enqueueEventInput.parse(
        baseInput({ eventName: "Purchase", currency: "USD" }),
      ),
    ).toThrow()
  })

  test("rejects Purchase without currency", () => {
    expect(() =>
      enqueueEventInput.parse(
        baseInput({ eventName: "Purchase", value: "9.99" }),
      ),
    ).toThrow()
  })

  test("accepts Purchase with both value and currency", () => {
    const result = enqueueEventInput.parse(
      baseInput({ eventName: "Purchase", value: "9.99", currency: "USD" }),
    )
    expect(result).toMatchObject({
      eventName: "Purchase",
      value: "9.99",
      currency: "USD",
    })
  })

  test("accepts LeadSubmitted without value or currency", () => {
    const result = enqueueEventInput.parse(
      baseInput({ eventName: "LeadSubmitted" }),
    )
    expect(result.eventName).toBe("LeadSubmitted")
  })
})

describe("enqueueEventInput — event catalog per action source", () => {
  test("rejects a custom event name for business_messaging", () => {
    expect(() =>
      enqueueEventInput.parse(
        baseInput({
          actionSource: "business_messaging",
          eventName: "MyCustomEvent",
        }),
      ),
    ).toThrow()
  })

  test("accepts a custom event name for a pixel-catalog action source", () => {
    const result = enqueueEventInput.parse(
      baseInput({ actionSource: "email", eventName: "MyCustomEvent" }),
    )
    expect(result.eventName).toBe("MyCustomEvent")
  })
})

describe("enqueueEventInput — defaults", () => {
  test("defaults eventName and actionSource when omitted", () => {
    const result = enqueueEventInput.parse(baseInput())
    expect(result.eventName).toBe("LeadSubmitted")
    expect(result.actionSource).toBe("business_messaging")
  })
})
