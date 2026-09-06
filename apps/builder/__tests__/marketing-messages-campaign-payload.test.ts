import { describe, expect, test } from "vitest"
import { buildCampaignBudget } from "@/features/facebook-marketing-messages/lib/campaign-payload"
import { createMarketingMessageSchema } from "@/features/facebook-marketing-messages/schema/resource"

const validInput = {
  name: "Spring promo",
  pageId: "page-1",
  adAccountId: "act_123",
  currency: "USD",
  budgetType: "daily" as const,
  budgetMajorUnits: 30,
  content: { templateType: "text" as const, text: "Hi", quickReplies: [] },
}

describe("buildCampaignBudget", () => {
  test("converts a default-offset currency to cents", () => {
    expect(
      buildCampaignBudget({
        budgetType: "daily",
        budgetMajorUnits: 30,
        currency: "USD",
      }),
    ).toEqual({
      budgetType: "daily",
      budgetMinorUnits: 3000,
      currencyOffset: 100,
    })
  })

  test("leaves a zero-decimal currency untouched", () => {
    expect(
      buildCampaignBudget({
        budgetType: "lifetime",
        budgetMajorUnits: 90_000,
        currency: "JPY",
      }),
    ).toEqual({
      budgetType: "lifetime",
      budgetMinorUnits: 90_000,
      currencyOffset: 1,
    })
  })

  test("rounds fractional major units", () => {
    expect(
      buildCampaignBudget({
        budgetType: "daily",
        budgetMajorUnits: 19.99,
        currency: "USD",
      }).budgetMinorUnits,
    ).toBe(1999)
  })
})

describe("createMarketingMessageSchema", () => {
  test("accepts a complete input", () => {
    expect(createMarketingMessageSchema.safeParse(validInput).success).toBe(
      true,
    )
  })

  test("rejects a zero budget", () => {
    const parsed = createMarketingMessageSchema.safeParse({
      ...validInput,
      budgetMajorUnits: 0,
    })

    expect(parsed.success).toBe(false)
  })

  test("rejects a negative budget", () => {
    const parsed = createMarketingMessageSchema.safeParse({
      ...validInput,
      budgetMajorUnits: -5,
    })

    expect(parsed.success).toBe(false)
  })

  test("rejects a name over 120 characters", () => {
    const parsed = createMarketingMessageSchema.safeParse({
      ...validInput,
      name: "a".repeat(121),
    })

    expect(parsed.success).toBe(false)
  })

  test("rejects an unknown budget type", () => {
    const parsed = createMarketingMessageSchema.safeParse({
      ...validInput,
      budgetType: "weekly",
    })

    expect(parsed.success).toBe(false)
  })

  test("rejects content that fails the template rules", () => {
    const parsed = createMarketingMessageSchema.safeParse({
      ...validInput,
      content: {
        templateType: "text",
        text: "a".repeat(641),
        quickReplies: [],
      },
    })

    expect(parsed.success).toBe(false)
  })

  test("requires a page", () => {
    const { pageId, ...withoutPage } = validInput

    expect(createMarketingMessageSchema.safeParse(withoutPage).success).toBe(
      false,
    )
  })
})
