import { describe, expect, test, vi } from "vitest"

// Repo invariant 14: a trial-expired workspace is read/delete-only, so deleting
// a Marketing Messages campaign must stay possible — both from the builder
// action and from the public `DELETE /v1/marketing-messages/campaigns/{id}`.

type Captured = { client: "normal" | "allowExpired"; handler: unknown }
const captured: Captured[] = vi.hoisted(() => [])

function chain(client: Captured["client"]) {
  const c = {
    bindArgsSchemas: vi.fn(),
    inputSchema: vi.fn(),
    action: vi.fn((handler: unknown) => {
      captured.push({ client, handler })
      return handler
    }),
  }
  c.bindArgsSchemas.mockReturnValue(c)
  c.inputSchema.mockReturnValue(c)
  return c
}

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: chain("normal"),
  workspaceActionClientAllowExpired: chain("allowExpired"),
}))
vi.mock(
  "@/features/facebook-marketing-messages/lib/campaign-operations",
  () => ({
    deleteMarketingMessages: vi.fn(),
  }),
)

const quota = vi.hoisted(() => ({
  isCloud: vi.fn(() => true),
  getAccessState: vi.fn(async () => ({ blocked: true, reason: "status" })),
  isAtLimit: vi.fn(async () => false),
}))
vi.mock("@/env", () => ({ isCloud: quota.isCloud }))
vi.mock("@chatbotx.io/business", () => ({
  userQuotaService: { getAccessState: quota.getAccessState },
  quotaEnforcementService: { isAtLimit: quota.isAtLimit },
}))

await import("@/features/facebook-marketing-messages/actions/delete.action")
const { assertWorkspaceOwnerAccessForMethod } = await import(
  "@/lib/workspace/authorize-workspace-access"
)

describe("deleting a Marketing Messages campaign on a trial-expired workspace", () => {
  test("the builder action is built from workspaceActionClientAllowExpired", () => {
    expect(captured.map((c) => c.client)).toEqual(["allowExpired"])
  })

  test("the public DELETE route passes the owner trial gate", async () => {
    await expect(
      assertWorkspaceOwnerAccessForMethod({
        method: "DELETE",
        ownerId: "owner-1",
        path: "/v1/marketing-messages/campaigns/{id}",
      }),
    ).resolves.toBeUndefined()
  })
})
