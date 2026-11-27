// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const requestAccountDeletion = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  userService: { requestAccountDeletion },
}))

vi.mock("@/lib/safe-action", () => ({
  authActionClient: {
    inputSchema: () => ({ action: (handler: unknown) => handler }),
  },
}))

const { ChatbotXException } = await import("@chatbotx.io/business/errors")
const { requestAccountDeletion: requestAccountDeletionActionUntyped } =
  await import(
    "../src/features/account-deletion/actions/request-account-deletion"
  )
const requestAccountDeletionAction =
  requestAccountDeletionActionUntyped as unknown as (props: {
    ctx: { user: { id: string } }
  }) => Promise<{ status: "success" | "supportRequired" }>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("requestAccountDeletion", () => {
  test("maps the reseller self-deletion refusal to supportRequired", async () => {
    requestAccountDeletion.mockRejectedValue(
      new ChatbotXException(
        "Reseller accounts must contact support to delete their account",
        "accountDeletionSupportRequired",
        403,
      ),
    )

    await expect(
      requestAccountDeletionAction({ ctx: { user: { id: "user-1" } } }),
    ).resolves.toEqual({ status: "supportRequired" })
  })

  test("schedules deletion for the authenticated user", async () => {
    requestAccountDeletion.mockResolvedValue({
      scheduledDeletionAt: new Date("2026-11-13T12:00:00.000Z"),
    })

    await expect(
      requestAccountDeletionAction({ ctx: { user: { id: "user-1" } } }),
    ).resolves.toEqual({ status: "success" })
    expect(requestAccountDeletion).toHaveBeenCalledWith({
      actor: { userId: "user-1" },
      userId: "user-1",
    })
  })
})
