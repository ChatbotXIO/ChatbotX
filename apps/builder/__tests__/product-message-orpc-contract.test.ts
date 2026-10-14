// @vitest-environment node

import {
  ProductMessageUnresolvableError,
  validationException,
} from "@chatbotx.io/business/errors"
import {
  type ProductMessageUnresolvableReason,
  productMessageUnresolvableReasons,
} from "@chatbotx.io/database/partials"
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
const { commonApiErrors, possibleErrorsOnSendingMessage } = await import(
  "@/lib/orpc/orpc-error-helper"
)
const contract = base
  .errors({ ...commonApiErrors, ...possibleErrorsOnSendingMessage })
  .use(onError(mapKnownOrpcErrors))

const run = (error: Error) =>
  call(
    contract.handler(() => {
      throw error
    }),
    {},
    { context: { headers: new Headers() } },
  )

describe("product message oRPC contract", () => {
  test.each(
    productMessageUnresolvableReasons.filter(
      (reason) => reason !== "productsNotSendable",
    ),
  )("a %s refusal is a defined 422 that keeps its reason", async (reason: ProductMessageUnresolvableReason) => {
    await expect(
      run(new ProductMessageUnresolvableError(reason)),
    ).rejects.toMatchObject({
      code: "productMessageUnresolvable",
      status: 422,
      defined: true,
      data: { reason },
    })
  })

  test("a partial send names the products that cannot be sent", async () => {
    await expect(
      run(
        new ProductMessageUnresolvableError("productsNotSendable", ["7", "8"]),
      ),
    ).rejects.toMatchObject({
      code: "productMessageUnresolvable",
      status: 422,
      defined: true,
      data: { reason: "productsNotSendable", productIds: "7,8" },
    })
  })

  test("a message that breaks the channel's rules is the declared validation error", async () => {
    await expect(
      run(
        validationException("products", "Invalid product message", {
          issues: "header: sendProductsFieldRequired",
        }),
      ),
    ).rejects.toMatchObject({
      code: "validation",
      status: 422,
      defined: true,
    })
  })
})
