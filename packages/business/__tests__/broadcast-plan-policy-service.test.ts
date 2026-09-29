// @vitest-environment node

import {
  broadcastPlanLimitDataSchema,
  TRIAL_BROADCAST_PLAN_POLICY,
} from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  countActive: vi.fn(),
  getPlanIdentity: vi.fn(),
  isCloud: vi.fn(),
  workspaceFind: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings: [...strings],
    values,
  }),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  broadcastRepository: { countActive: mocks.countActive },
}))

vi.mock("../src/keys", () => ({ isCloud: mocks.isCloud }))
vi.mock("../src/user-quota/service", () => ({
  userQuotaService: { getPlanIdentity: mocks.getPlanIdentity },
}))
vi.mock("../src/workspace/service", () => ({
  workspaceService: { find: mocks.workspaceFind },
}))

const { broadcastPlanPolicyService } = await import(
  "../src/broadcast/plan-policy.service"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isCloud.mockReturnValue(true)
  mocks.workspaceFind.mockResolvedValue({ ownerId: "owner-1" })
  mocks.getPlanIdentity.mockResolvedValue({
    isOnTrial: false,
    planName: "Pro",
  })
  mocks.countActive.mockResolvedValue(0)
})

describe("broadcastPlanPolicyService.resolveForWorkspace", () => {
  test("returns unrestricted without reads outside cloud", async () => {
    mocks.isCloud.mockReturnValue(false)

    await expect(
      broadcastPlanPolicyService.resolveForWorkspace("ws-1"),
    ).resolves.toEqual({
      policy: { kind: "unrestricted" },
      planName: null,
    })
    expect(mocks.workspaceFind).not.toHaveBeenCalled()
    expect(mocks.getPlanIdentity).not.toHaveBeenCalled()
  })

  test("returns unrestricted for a cloud owner who is not on trial", async () => {
    await expect(
      broadcastPlanPolicyService.resolveForWorkspace("ws-1"),
    ).resolves.toEqual({
      policy: { kind: "unrestricted" },
      planName: "Pro",
    })
    expect(mocks.workspaceFind).toHaveBeenCalledWith({
      where: { id: "ws-1" },
    })
    expect(mocks.getPlanIdentity).toHaveBeenCalledWith("owner-1")
  })

  test.each([
    "Trial",
    null,
  ])("returns the trial policy with raw planName %s", async (planName) => {
    mocks.getPlanIdentity.mockResolvedValue({ isOnTrial: true, planName })

    await expect(
      broadcastPlanPolicyService.resolveForWorkspace("ws-1"),
    ).resolves.toEqual({
      policy: TRIAL_BROADCAST_PLAN_POLICY,
      planName,
    })
  })

  test("returns unrestricted when the workspace is missing", async () => {
    mocks.workspaceFind.mockResolvedValue(undefined)

    await expect(
      broadcastPlanPolicyService.resolveForWorkspace("missing"),
    ).resolves.toEqual({
      policy: { kind: "unrestricted" },
      planName: null,
    })
    expect(mocks.getPlanIdentity).not.toHaveBeenCalled()
  })
})

describe("broadcastPlanPolicyService enforcement", () => {
  const ctx = {
    policy: TRIAL_BROADCAST_PLAN_POLICY,
    planName: "Trial",
  } as const

  test("delegates channel-first checks to the restricted policy registry", () => {
    expect(broadcastPlanPolicyService.appliesToChannel("messenger")).toBe(true)
    expect(broadcastPlanPolicyService.appliesToChannel("whatsapp")).toBe(false)
  })

  test("returns null when the resolved policy does not govern the channel", () => {
    expect(
      broadcastPlanPolicyService.restrictionFor(ctx, "whatsapp"),
    ).toBeNull()
    expect(broadcastPlanPolicyService.restrictionFor(ctx, "messenger")).toEqual(
      ctx,
    )
  })

  test("throws sendRate only above the configured cap", () => {
    expect(() =>
      broadcastPlanPolicyService.assertSendRateAllowed(ctx, null),
    ).not.toThrow()
    expect(() =>
      broadcastPlanPolicyService.assertSendRateAllowed(ctx, 60),
    ).not.toThrow()
    expect(() =>
      broadcastPlanPolicyService.assertSendRateAllowed(ctx, 61),
    ).toThrowError(expect.objectContaining({ code: "broadcastPlanLimit" }))
  })

  test("omits a null plan name from a schema-valid sendRate payload", () => {
    try {
      broadcastPlanPolicyService.assertSendRateAllowed(
        { ...ctx, planName: null },
        61,
      )
      throw new Error("Expected the rate assertion to fail")
    } catch (error) {
      expect(error).toMatchObject({
        code: "broadcastPlanLimit",
        httpStatusCode: 403,
        data: { reason: "sendRate" },
      })
      if (!(error instanceof Error && "data" in error)) {
        throw error
      }
      const parsed = broadcastPlanLimitDataSchema.parse(error.data)
      expect(parsed).not.toHaveProperty("planName")
      expect(Object.values(parsed).every((value) => value !== null)).toBe(true)
    }
  })

  test.each([
    "",
    "   ",
  ])("omits a blank plan name from a schema-valid sendRate payload", (planName) => {
    try {
      broadcastPlanPolicyService.assertSendRateAllowed({ ...ctx, planName }, 61)
      throw new Error("Expected the rate assertion to fail")
    } catch (error) {
      if (!(error instanceof Error && "data" in error)) {
        throw error
      }
      const parsed = broadcastPlanLimitDataSchema.parse(error.data)
      expect(parsed).not.toHaveProperty("planName")
    }
  })

  test("locks activation with the workspace-scoped advisory key", async () => {
    const execute = vi.fn().mockResolvedValue(undefined)

    await broadcastPlanPolicyService.lockActivation(
      { execute } as never,
      "ws-1",
    )

    expect(execute).toHaveBeenCalledWith({
      strings: ["select pg_advisory_xact_lock(hashtextextended(", ", 0))"],
      values: ["broadcast-activation:ws-1"],
    })
  })

  test("passes channel and active statuses to the repository", async () => {
    await broadcastPlanPolicyService.assertActiveSlotAvailable({} as never, {
      workspaceId: "ws-1",
      channel: "messenger",
      ctx,
      excludeBroadcastId: "b-1",
    })

    expect(mocks.countActive).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        channel: "messenger",
        statuses: ["scheduled", "sending"],
        excludeId: "b-1",
      },
      {},
    )
  })

  test("throws a schema-valid activeBroadcasts error when the slot is full", async () => {
    mocks.countActive.mockResolvedValue(1)

    const promise = broadcastPlanPolicyService.assertActiveSlotAvailable(
      {} as never,
      { workspaceId: "ws-1", channel: "messenger", ctx },
    )

    await expect(promise).rejects.toMatchObject({
      code: "broadcastPlanLimit",
      httpStatusCode: 403,
      data: { reason: "activeBroadcasts" },
    })
    await promise.catch((error: unknown) => {
      if (!(error instanceof Error && "data" in error)) {
        throw error
      }
      expect(broadcastPlanLimitDataSchema.safeParse(error.data).success).toBe(
        true,
      )
    })
  })
})
