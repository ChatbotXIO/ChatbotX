// @vitest-environment node

import {
  ContactSyncMappingError,
  contactSyncAlreadyRunningError,
  contactSyncCooldownError,
} from "@chatbotx.io/business/contact-sync/errors"
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
const {
  commonApiErrors,
  possibleErrorsOnContactSyncSource,
  possibleErrorsOnSchedulingContactSync,
} = await import("@/lib/orpc/orpc-error-helper")

/** Throws `error` from a procedure declaring `errors`, as a public route does. */
const run = (errors: Record<string, unknown>, error: Error) =>
  call(
    base
      .errors({ ...commonApiErrors, ...errors })
      .use(onError(mapKnownOrpcErrors))
      .handler(() => {
        throw error
      }),
    {},
    { context: { headers: new Headers() } },
  )

describe("contact sync oRPC contract", () => {
  test("invalid mappings are a defined 422 listing every refused row", async () => {
    await expect(
      run(
        possibleErrorsOnContactSyncSource,
        new ContactSyncMappingError([
          { kind: "tag", externalId: "12", reason: "targetNotFound" },
          { kind: "customField", externalId: "7", reason: "typeMismatch" },
        ]),
      ),
    ).rejects.toMatchObject({
      code: "contactSyncMappingInvalid",
      status: 422,
      defined: true,
      data: { "tag:12": "targetNotFound", "customField:7": "typeMismatch" },
    })
  })

  test("a sync already running names the live run", async () => {
    await expect(
      run(
        possibleErrorsOnSchedulingContactSync,
        contactSyncAlreadyRunningError("run-1"),
      ),
    ).rejects.toMatchObject({
      code: "contactSyncAlreadyRunning",
      status: 409,
      defined: true,
      data: { runId: "run-1" },
    })
  })

  test("the cooldown says when a sync may start again", async () => {
    await expect(
      run(
        possibleErrorsOnSchedulingContactSync,
        contactSyncCooldownError(new Date("2030-01-01T04:00:00.000Z")),
      ),
    ).rejects.toMatchObject({
      code: "contactSyncCooldown",
      status: 409,
      defined: true,
      data: { nextSyncAt: "2030-01-01T04:00:00.000Z" },
    })
  })
})
