// @vitest-environment node

import { broadcastPlanLimitException } from "@chatbotx.io/business/errors"
import { TRIAL_BROADCAST_PLAN_POLICY } from "@chatbotx.io/database/partials"
import { call, onError } from "@orpc/server"
import { describe, expect, test, vi } from "vitest"

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

vi.mock("@/middlewares/auth", () => ({ authMiddleware: {} }))
vi.mock("@/middlewares/channel-api-token-auth", () => ({
  channelApiTokenAuthMidddleware: {},
}))
vi.mock("@/middlewares/workspace-token-auth", () => ({
  workspaceTokenAuthMidddleware: {},
}))
vi.mock("@/lib/workspace/authorize-workspace-access", () => ({
  DENIAL_MESSAGES: {
    trialExpired: "Trial expired",
    macLimitReached: "Monthly active contact limit reached",
  },
}))

const { base } = await import("@/middlewares/context")
const { mapKnownOrpcErrors } = await import("@/orpc")
const { commonApiErrors, possibleErrorsOnActivatingBroadcast } = await import(
  "@/lib/orpc/orpc-error-helper"
)

const contract = base
  .errors({ ...commonApiErrors, ...possibleErrorsOnActivatingBroadcast })
  .use(onError(mapKnownOrpcErrors))

describe("broadcast plan-limit oRPC contract", () => {
  test("returns a defined structured 403 without touching the database", async () => {
    const error = broadcastPlanLimitException("activeBroadcasts", {
      policy: TRIAL_BROADCAST_PLAN_POLICY,
      planName: "Trial",
    })
    const procedure = contract.handler(() => {
      throw error
    })

    await expect(
      call(procedure, {}, { context: { headers: new Headers() } }),
    ).rejects.toMatchObject({
      code: "broadcastPlanLimit",
      status: 403,
      defined: true,
      data: error.data,
    })
  })

  test("allows a draft-returning handler to resolve normally", async () => {
    const procedure = contract.handler(async () => ({
      id: "broadcast-1",
      status: "draft",
    }))

    await expect(
      call(procedure, {}, { context: { headers: new Headers() } }),
    ).resolves.toEqual({ id: "broadcast-1", status: "draft" })
  })
})
