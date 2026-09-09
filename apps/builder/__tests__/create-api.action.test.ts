// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertPublicUrl: vi.fn(),
  connect: vi.fn(),
  findWorkspaceOrFail: vi.fn(),
  createWorkspace: vi.fn(),
  hasWorkspaceAccess: vi.fn(async () => true),
  generateApiChannelToken: vi.fn(async () => ({
    token: "plain-token",
    tokenHash: "token-hash",
    tokenPrefix: "tok_",
  })),
  generateSigningSecret: vi.fn(() => "signing-secret"),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { authActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  assertPublicUrl: mocks.assertPublicUrl,
  hasWorkspaceAccess: mocks.hasWorkspaceAccess,
  integrationApiService: { connect: mocks.connect },
  workspaceService: {
    findOrFail: mocks.findWorkspaceOrFail,
    create: mocks.createWorkspace,
  },
}))

vi.mock("@chatbotx.io/business/workspace-api-token/credentials", () => ({
  generateApiChannelToken: mocks.generateApiChannelToken,
  generateSigningSecret: mocks.generateSigningSecret,
}))

const { createApiAction } = await import(
  "../src/features/integration-api/actions/create-api.action"
)

type ActionHandler = (args: {
  parsedInput: {
    workspaceId?: string
    name: string
    callbackUrl?: string | null
  }
  ctx: { user: { id: string } }
}) => Promise<unknown>

describe("createApiAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasWorkspaceAccess.mockResolvedValue(true)
    mocks.findWorkspaceOrFail.mockResolvedValue({
      id: "workspace-1",
      ownerId: "owner-1",
    })
    mocks.connect.mockResolvedValue({ workspaceId: "workspace-1" })
  })

  test("passes the workspace owner for ownership and acting admin for audit", async () => {
    const result = await (createApiAction as unknown as ActionHandler)({
      parsedInput: {
        workspaceId: "workspace-1",
        name: "Support API",
        callbackUrl: "https://example.com/api/webhook",
      },
      ctx: { user: { id: "admin-1" } },
    })

    expect(mocks.assertPublicUrl).toHaveBeenCalledWith(
      "https://example.com/api/webhook",
      "API channel callback URL",
    )
    expect(mocks.findWorkspaceOrFail).toHaveBeenCalledWith({
      where: { id: "workspace-1" },
    })
    expect(mocks.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-1",
        actorUserId: "admin-1",
        workspaceId: "workspace-1",
        name: "Support API",
        tokenHash: "token-hash",
        tokenPrefix: "tok_",
        callbackUrl: "https://example.com/api/webhook",
      }),
    )
    expect(result).toEqual({
      workspaceId: "workspace-1",
      token: "plain-token",
    })
  })

  test("rejects a workspaceId the caller is not a member of", async () => {
    mocks.hasWorkspaceAccess.mockResolvedValue(false)

    await expect(
      (createApiAction as unknown as ActionHandler)({
        parsedInput: {
          workspaceId: "workspace-1",
          name: "Support API",
        },
        ctx: { user: { id: "intruder-1" } },
      }),
    ).rejects.toThrow()

    expect(mocks.connect).not.toHaveBeenCalled()
  })
})
