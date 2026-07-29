import { stepTypes } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  issueCoupon: vi.fn(),
  markCouponUsed: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  couponService: {
    issueCoupon: (...args: unknown[]) => mocks.issueCoupon(...args),
    markCouponUsed: (...args: unknown[]) => mocks.markCouponUsed(...args),
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

const { markCouponUsed, setUpCoupon } = await import(
  "../src/integration/handlers/coupon"
)

describe("coupon step handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("setUpCoupon returns an error status when coupon issuing throws", async () => {
    mocks.issueCoupon.mockRejectedValue(new Error("db down"))

    await expect(
      setUpCoupon({
        conversation: {
          id: "conversation-1",
          workspaceId: "workspace-1",
          contactId: "contact-1",
        },
        step: {
          stepType: stepTypes.enum.setUpCoupon,
          topicId: "topic-1",
        },
      } as Parameters<typeof setUpCoupon>[0]),
    ).resolves.toEqual({ status: "error", result: null })
  })

  test("markCouponUsed returns an error status when marking throws", async () => {
    mocks.markCouponUsed.mockRejectedValue(new Error("db down"))

    await expect(
      markCouponUsed({
        conversation: {
          id: "conversation-1",
          workspaceId: "workspace-1",
          contactId: "contact-1",
        },
        step: {
          stepType: stepTypes.enum.markCouponUsed,
          topicId: "topic-1",
        },
      } as Parameters<typeof markCouponUsed>[0]),
    ).resolves.toEqual({ status: "error", result: null })
  })
})
