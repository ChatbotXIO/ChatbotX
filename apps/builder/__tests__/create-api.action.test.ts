// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertPublicUrl: vi.fn(),
  connect: vi.fn(),
  findWorkspaceOrFail: vi.fn(),
  createWorkspace: vi.fn(),
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
  integrationApiService: { connect: mocks.connect },
  workspaceService: {
    findOrFail: mocks.findWorkspaceOrFail,
    create: mocks.createWorkspace,
  },
}))

vi.mock("../src/features/integration-api/lib/generate-credentials", () => ({
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
})
