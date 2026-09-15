import { describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type ProcedureHandler = (args: {
  input: unknown
  context: unknown
}) => Promise<unknown>

const { authorizedAPI, mocks, workspaceAuthorizedMidddleware } = vi.hoisted(
  () => {
    const state: {
      handlers: Record<string, ProcedureHandler>
      routeConfig?: RouteConfig
    } = { handlers: {} }
    let currentRouteName: string | undefined

    const procedure = {
      route: vi.fn((config: RouteConfig) => {
        currentRouteName = config.path
        state.routeConfig = config
        return procedure
      }),
      input: vi.fn(() => procedure),
      use: vi.fn(() => procedure),
      output: vi.fn(() => procedure),
      handler: vi.fn((handler: ProcedureHandler) => {
        if (currentRouteName) {
          state.handlers[currentRouteName] = handler
        }
        return { handler }
      }),
    }

    return {
      authorizedAPI: procedure,
      mocks: {
        resolveBroadcastSecret: vi.fn(),
        signMemberConnectToken: vi.fn(),
        state,
      },
      workspaceAuthorizedMidddleware: vi.fn(),
    }
  },
)

vi.mock("@/orpc", () => ({ authorizedAPI }))
vi.mock("@/middlewares/auth", () => ({ workspaceAuthorizedMidddleware }))
vi.mock("@chatbotx.io/business", () => ({
  resolveBroadcastSecret: mocks.resolveBroadcastSecret,
}))
vi.mock("@chatbotx.io/partysocket-config/auth", () => ({
  signMemberConnectToken: mocks.signMemberConnectToken,
}))

await import("@/features/realtime/api/private")

const mintHandler =
  mocks.state.handlers["/workspaces/{workspaceId}/realtime/connect-token"]

describe("mintWorkspaceConnectTokenAuthenticatedAPI", () => {
  test("signs a token bound to the workspace-authorized context's user and workspace, not the raw input", async () => {
    mocks.resolveBroadcastSecret.mockReturnValue("the-secret")
    mocks.signMemberConnectToken.mockResolvedValue("signed-token")

    const result = await mintHandler?.({
      // `workspaceId` in the input is whatever the caller sent; the
      // membership-checked `context.workspace.id` is what must actually get
      // signed, so make them differ to prove the handler reads context, not
      // input.
      input: { workspaceId: "untrusted-input-workspace" },
      context: {
        user: { id: "u_1" },
        workspace: { id: "ws_1" },
      },
    })

    expect(mocks.signMemberConnectToken).toHaveBeenCalledWith(
      { workspaceId: "ws_1", userId: "u_1" },
      "the-secret",
    )
    expect(mocks.resolveBroadcastSecret).toHaveBeenCalledWith({
      workspaceId: "ws_1",
    })
    expect(result).toEqual({ token: "signed-token" })
  })

  test("route is registered under the expected workspace-scoped path", () => {
    expect(mocks.state.routeConfig).toMatchObject({
      method: "POST",
      path: "/workspaces/{workspaceId}/realtime/connect-token",
    })
  })
})
