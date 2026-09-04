// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  checkWorkspaceOwnerAccess,
  assertApiNotRateLimited,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  checkWorkspaceOwnerAccess: vi.fn().mockResolvedValue(null),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/lib/workspace/authorize-workspace-access", () => ({
  checkWorkspaceOwnerAccess,
  isWorkspaceMutationMethod: (method: string | undefined) =>
    !["GET", "HEAD", "DELETE"].includes(method ?? "POST"),
  isReadOnlyTokenAllowedMethod: (method: string | undefined) =>
    ["GET", "HEAD"].includes(method ?? "POST"),
  workspaceAccessDenialOrpcError: (reason: string) => new Error(reason),
}))

// `@/orpc` also exports `authorizedAPI`, which pulls in the full better-auth
// stack via `authMiddleware` — irrelevant to workspace-token scope
// enforcement and heavy/unsafe to initialize in a unit test. Stub it so
// importing `@/orpc` for `workspaceTokenAuthAPIForScope` stays lightweight.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
}))

const { call } = await import("@orpc/server")
const { workspaceTokenAuthAPIForScope } = await import("@/orpc")

const TOKEN = "cbx_ws_fixture"

type Auth = {
  workspace: { id: string; ownerId: string }
  apiToken: {
    id: string
    permission: "full" | "read_only"
    scopes: string[] | null
  }
}

const authResult = (
  scopes: string[] | null,
  permission: "full" | "read_only" = "full",
): Auth => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission, scopes },
})

const buildProcedure = (
  scope: "contacts" | "inbox" | "automation" | "broadcasts",
  method: "GET" | "POST",
) =>
  workspaceTokenAuthAPIForScope(scope)
    .route({ method, path: `/v1/test-${scope}` })
    .handler(async ({ context }) => ({
      ok: true,
      workspaceId: context.workspace.id,
    }))

const invoke = (
  procedure: ReturnType<typeof buildProcedure>,
  headers: Headers = new Headers({ Authorization: `Bearer ${TOKEN}` }),
) => call(procedure, {}, { context: { headers } })

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  checkWorkspaceOwnerAccess.mockResolvedValue(null)
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("workspace API token resource-scope enforcement", () => {
  test("null scopes (unrestricted) passes every scoped route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))

    const contactsProcedure = buildProcedure("contacts", "GET")
    const broadcastsProcedure = buildProcedure("broadcasts", "GET")

    await expect(invoke(contactsProcedure)).resolves.toMatchObject({
      ok: true,
    })
    await expect(invoke(broadcastsProcedure)).resolves.toMatchObject({
      ok: true,
    })
  })

  test("a token scoped to ['contacts'] passes the contacts-scoped route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    const procedure = buildProcedure("contacts", "GET")

    await expect(invoke(procedure)).resolves.toMatchObject({ ok: true })
  })

  test("a token scoped to ['contacts'] is denied a broadcasts-scoped route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    const procedure = buildProcedure("broadcasts", "GET")

    await expect(invoke(procedure)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'broadcasts' scope",
    })
  })

  test("a mixed-scope contact router: a contacts-scoped token can hit the contacts-scoped procedure but not the inbox-scoped one", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    const contactsProcedure = buildProcedure("contacts", "POST")
    const inboxProcedure = buildProcedure("inbox", "POST")

    await expect(invoke(contactsProcedure)).resolves.toMatchObject({
      ok: true,
    })
    await expect(invoke(inboxProcedure)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'inbox' scope",
    })
  })

  test("an inbox-scoped token can hit the inbox-scoped procedure but not the contacts-scoped one", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["inbox"]))

    const inboxProcedure = buildProcedure("inbox", "POST")
    const contactsProcedure = buildProcedure("contacts", "POST")

    await expect(invoke(inboxProcedure)).resolves.toMatchObject({ ok: true })
    await expect(invoke(contactsProcedure)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  })

  test("scope enforcement runs after the read_only permission gate: a read_only token is still blocked from a mutation regardless of scope", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(
      authResult(["contacts"], "read_only"),
    )

    const procedure = buildProcedure("contacts", "POST")

    await expect(invoke(procedure)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Read-only token cannot perform this operation",
    })
  })

  test("scope enforcement does not block a read_only token's in-scope GET", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(
      authResult(["contacts"], "read_only"),
    )

    const procedure = buildProcedure("contacts", "GET")

    await expect(invoke(procedure)).resolves.toMatchObject({ ok: true })
  })

  test("an invalid token is rejected before scope is ever considered", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(undefined)

    const procedure = buildProcedure("contacts", "GET")

    await expect(invoke(procedure)).rejects.toMatchObject({
      code: "INVALID_CHATBOT_TOKEN",
    })
  })
})

describe("GET /v1/workspaces removal", () => {
  test("the public router no longer imports or mounts the workspace-token workspace-fetch router", async () => {
    const fs = await import("node:fs")
    const path = await import("node:path")

    const publicRouterSource = fs.readFileSync(
      path.join(process.cwd(), "src/routers/public.ts"),
      "utf-8",
    )
    expect(publicRouterSource).not.toContain(
      "features/workspaces/api/workspace-token",
    )
    expect(publicRouterSource).not.toContain("workspaceAPIs")

    expect(
      fs.existsSync(
        path.join(
          process.cwd(),
          "src/features/workspaces/api/workspace-token.ts",
        ),
      ),
    ).toBe(false)
  })
})
