import { describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// integrationWhatsappRepository.listClientSafeByWorkspaceId — the column
// allowlist must never widen to include the encrypted `auth` or
// `capiAccessToken` columns; several whatsapps/[id]/* server pages rely on
// this list being safe to forward to client components.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}))

vi.mock("../src/client", () => ({
  and: vi.fn(),
  db: {
    query: {
      integrationWhatsappModel: {
        findMany: mocks.findMany,
      },
    },
  },
  eq: vi.fn(),
  gt: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
  lt: vi.fn(),
  lte: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("../src/schema", () => ({
  integrationWhatsappModel: {
    id: "id",
    workspaceId: "workspaceId",
  },
  whatsappSignupSessionModel: {
    id: "id",
  },
}))

const { integrationWhatsappRepository } = await import(
  "../src/repositories/integration-whatsapp/repository"
)

describe("integrationWhatsappRepository.listClientSafeByWorkspaceId", () => {
  test("the column allowlist never includes auth or capiAccessToken", async () => {
    mocks.findMany.mockResolvedValue([])

    await integrationWhatsappRepository.listClientSafeByWorkspaceId({
      workspaceId: "ws_1",
    })

    expect(mocks.findMany).toHaveBeenCalledOnce()
    const call = mocks.findMany.mock.calls[0]?.[0] as {
      columns: Record<string, boolean>
    }

    expect(call.columns).not.toHaveProperty("auth")
    expect(call.columns).not.toHaveProperty("capiAccessToken")
    expect(call.columns).toEqual(
      expect.objectContaining({
        id: true,
        name: true,
        workspaceId: true,
      }),
    )
  })
})
