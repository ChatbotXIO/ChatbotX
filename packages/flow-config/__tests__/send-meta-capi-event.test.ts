import {
  metaCapiActionSourceValues,
  metaCapiBusinessMessagingEventNames,
  metaCapiContentTypeValues,
  metaPixelStandardEventNames,
} from "@chatbotx.io/utils/meta-capi"
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
        actionSource: "business_messaging",
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

  test("accepts Purchase for the default business_messaging action source (with required value/currency)", () => {
    const parsed = sendMetaCapiEventSchema.parse({
      ...sendMetaCapiEventDefaultFn(),
      eventName: "Purchase",
      value: "10",
      currency: "USD",
    })

    expect(parsed.eventName).toBe("Purchase")
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

  test("normalizes static currency codes to uppercase", () => {
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
      actionSource: "business_messaging",
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

  describe("business_messaging event catalog", () => {
    test.each(
      metaCapiBusinessMessagingEventNames,
    )("accepts standard business-messaging event %s", (eventName) => {
      const requiresValue = eventName === "Purchase"
      const parsed = sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        actionSource: "business_messaging",
        eventName,
        ...(requiresValue ? { value: "10", currency: "USD" } : {}),
      })

      expect(parsed.eventName).toBe(eventName)
    })

    test("rejects a pixel-only event name (Lead) for business_messaging", () => {
      expect(() =>
        sendMetaCapiEventSchema.parse({
          ...sendMetaCapiEventDefaultFn(),
          actionSource: "business_messaging",
          eventName: "Lead",
        }),
      ).toThrow()
    })

    test("rejects a custom event name for business_messaging", () => {
      expect(() =>
        sendMetaCapiEventSchema.parse({
          ...sendMetaCapiEventDefaultFn(),
          actionSource: "business_messaging",
          eventName: "my-event",
        }),
      ).toThrow()
    })
  })

  describe("pixel event catalog (non-messaging action sources)", () => {
    test.each(
      metaPixelStandardEventNames,
    )("accepts standard pixel event %s for email", (eventName) => {
      const requiresValue = eventName === "Purchase"
      const parsed = sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        actionSource: "email",
        eventName,
        ...(requiresValue ? { value: "10", currency: "USD" } : {}),
      })

      expect(parsed.eventName).toBe(eventName)
    })

    test("rejects a business-messaging-only event name (LeadSubmitted) for email", () => {
      expect(() =>
        sendMetaCapiEventSchema.parse({
          ...sendMetaCapiEventDefaultFn(),
          actionSource: "email",
          eventName: "LeadSubmitted",
        }),
      ).toThrow()
    })

    test.each([
      "Order.Completed",
      "my-event",
      "1x",
      "x".repeat(50),
    ])("accepts custom event name %s for email", (eventName) => {
      const parsed = sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        actionSource: "email",
        eventName,
      })

      expect(parsed.eventName).toBe(eventName)
    })

    test("rejects a custom event name over 50 characters for email", () => {
      expect(() =>
        sendMetaCapiEventSchema.parse({
          ...sendMetaCapiEventDefaultFn(),
          actionSource: "email",
          eventName: "x".repeat(51),
        }),
      ).toThrow()
    })

    test("rejects an empty custom event name for email", () => {
      expect(() =>
        sendMetaCapiEventSchema.parse({
          ...sendMetaCapiEventDefaultFn(),
          actionSource: "email",
          eventName: "",
        }),
      ).toThrow()
    })

    test("rejects a whitespace-only custom event name for email", () => {
      expect(() =>
        sendMetaCapiEventSchema.parse({
          ...sendMetaCapiEventDefaultFn(),
          actionSource: "email",
          eventName: "   ",
        }),
      ).toThrow()
    })
  })

  describe("action_source", () => {
    test.each(
      metaCapiActionSourceValues,
    )("accepts action source %s", (actionSource) => {
      const parsed = sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        actionSource,
        eventName: "Purchase",
        value: "10",
        currency: "USD",
      })

      expect(parsed.actionSource).toBe(actionSource)
    })

    test.each([
      "website",
      "app",
    ])("rejects excluded action source %s", (actionSource) => {
      expect(() =>
        sendMetaCapiEventSchema.parse({
          ...sendMetaCapiEventDefaultFn(),
          actionSource,
        }),
      ).toThrow()
    })
  })

  describe("content_type", () => {
    test.each(
      metaCapiContentTypeValues,
    )("accepts content type %s", (contentType) => {
      const parsed = sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        contentType,
      })

      expect(parsed.contentType).toBe(contentType)
    })

    test("rejects an invalid content type", () => {
      expect(() =>
        sendMetaCapiEventSchema.parse({
          ...sendMetaCapiEventDefaultFn(),
          contentType: "digital_good",
        }),
      ).toThrow()
    })
  })

  describe("Purchase value/currency requirement", () => {
    test("rejects Purchase missing both value and currency", () => {
      const result = sendMetaCapiEventSchema.safeParse({
        ...sendMetaCapiEventDefaultFn(),
        eventName: "Purchase",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        const paths = result.error.issues.map((issue) => issue.path.join("."))
        expect(paths).toContain("value")
        expect(paths).toContain("currency")
      }
    })

    test("rejects Purchase missing only value", () => {
      const result = sendMetaCapiEventSchema.safeParse({
        ...sendMetaCapiEventDefaultFn(),
        eventName: "Purchase",
        currency: "USD",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        const paths = result.error.issues.map((issue) => issue.path.join("."))
        expect(paths).toContain("value")
      }
    })

    test("rejects Purchase missing only currency", () => {
      const result = sendMetaCapiEventSchema.safeParse({
        ...sendMetaCapiEventDefaultFn(),
        eventName: "Purchase",
        value: "10",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        const paths = result.error.issues.map((issue) => issue.path.join("."))
        expect(paths).toContain("currency")
      }
    })

    test("accepts Purchase with both value and currency", () => {
      const parsed = sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        eventName: "Purchase",
        value: "10",
        currency: "USD",
      })

      expect(parsed.value).toBe("10")
      expect(parsed.currency).toBe("USD")
    })

    test.each([
      "AddToCart",
      "ViewContent",
      "LeadSubmitted",
    ])("accepts %s without value or currency", (eventName) => {
      const parsed = sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        eventName,
      })

      expect(parsed.value).toBeUndefined()
      expect(parsed.currency).toBeUndefined()
    })

    test("accepts a custom event name without value or currency", () => {
      const parsed = sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        actionSource: "email",
        eventName: "my-event",
      })

      expect(parsed.value).toBeUndefined()
      expect(parsed.currency).toBeUndefined()
    })
  })

  describe("template values", () => {
    test("accepts a {{variable}} value verbatim", () => {
      const parsed = sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        eventName: "Purchase",
        value: "{{order_total}}",
        currency: "USD",
      })

      expect(parsed.value).toBe("{{order_total}}")
    })

    test("does not uppercase a {{variable}} currency", () => {
      const parsed = sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        eventName: "Purchase",
        value: "10",
        currency: "{{currency}}",
      })

      expect(parsed.currency).toBe("{{currency}}")
    })

    test("accepts template contentIds verbatim", () => {
      const parsed = sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        contentIds: "{{a}},{{b}}",
      })

      expect(parsed.contentIds).toBe("{{a}},{{b}}")
    })

    test("accepts a static contentIds value verbatim", () => {
      const parsed = sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        contentIds: "SKU-1, SKU-2",
      })

      expect(parsed.contentIds).toBe("SKU-1, SKU-2")
    })

    test("treats a whitespace-only contentIds value as unset", () => {
      const parsed = sendMetaCapiEventSchema.parse({
        ...sendMetaCapiEventDefaultFn(),
        contentIds: "   ",
      })

      expect(parsed.contentIds).toBeUndefined()
    })
  })

  test("parses a stored step from before actionSource existed, with defaults applied", () => {
    const legacyStoredStep = {
      id: "123456789012345678",
      stepType: "sendMetaCapiEvent",
      eventName: "LeadSubmitted",
      value: "10",
      currency: "USD",
      contentCategory: "Education",
      contentName: "Course",
      states: sendMetaCapiEventDefaultFn().states,
    }

    const parsed = sendMetaCapiEventSchema.parse(legacyStoredStep)

    expect(parsed.actionSource).toBe("business_messaging")
    expect(parsed.eventName).toBe("LeadSubmitted")
    expect(parsed.value).toBe("10")
    expect(parsed.currency).toBe("USD")
    expect(parsed.contentCategory).toBe("Education")
    expect(parsed.contentName).toBe("Course")
  })
})
