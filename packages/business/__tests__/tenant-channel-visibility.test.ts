import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// tenantService.resolveVisibleChannels is the two-tier channel-visibility
// policy: the platform (root tenant) sets the ceiling for every tenant, and a
// reseller's own tenant can only narrow it further — never widen it. A
// suspended reseller tenant's hiddenChannels must be ignored entirely (they
// lose their own policy, not gain access back). This is a pure UI-visibility
// gate: it must never be consulted for anything beyond deciding what to
// offer on the create picker.
// ---------------------------------------------------------------------------

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { tenantModel: { findFirst: vi.fn() } } },
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
}))

vi.mock("@chatbotx.io/database/schema", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  tenantModel: { ownerId: "tenant.ownerId" },
}))

vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  withCache: (_key: string, fn: () => unknown) => fn(),
  invalidateCacheByTags: vi.fn(async () => undefined),
}))

const { tenantService } = await import("../src/enterprise/tenant/service")

type TenantRow = {
  status: string
  hiddenChannels: string[] | null
}

describe("tenantService.resolveVisibleChannels", () => {
  let root: TenantRow | null
  let owned: TenantRow | null

  beforeEach(() => {
    root = null
    owned = null
    vi.spyOn(tenantService, "findById").mockImplementation(
      () => Promise.resolve(root) as ReturnType<typeof tenantService.findById>,
    )
    vi.spyOn(tenantService, "findByOwner").mockImplementation(
      () =>
        Promise.resolve(owned) as ReturnType<typeof tenantService.findByOwner>,
    )
  })

  test("hides nothing when neither tier has configured anything (opt-out default)", async () => {
    const visible = await tenantService.resolveVisibleChannels("owner-1")

    expect(visible).toContain("whatsapp")
    expect(visible).toContain("zalo")
    expect(visible).not.toContain("smtp")
    expect(visible).not.toContain("omnichannel")
  })

  test("platform hiding a channel removes it for every owner, including one with no tenant", async () => {
    root = { status: "active", hiddenChannels: ["tiktok"] }
    owned = null

    const visible = await tenantService.resolveVisibleChannels("plain-user")

    expect(visible).not.toContain("tiktok")
    expect(visible).toContain("whatsapp")
  })

  test("a reseller can narrow further on top of the platform ceiling", async () => {
    root = { status: "active", hiddenChannels: ["tiktok"] }
    owned = { status: "active", hiddenChannels: ["zalo"] }

    const visible = await tenantService.resolveVisibleChannels("reseller-1")

    expect(visible).not.toContain("tiktok")
    expect(visible).not.toContain("zalo")
    expect(visible).toContain("whatsapp")
  })

  test("a reseller cannot un-hide a channel the platform already hid", async () => {
    root = { status: "active", hiddenChannels: ["tiktok"] }
    // Reseller's own hiddenChannels does not include tiktok — irrelevant, it
    // was never theirs to allow back in.
    owned = { status: "active", hiddenChannels: [] }

    const visible = await tenantService.resolveVisibleChannels("reseller-1")

    expect(visible).not.toContain("tiktok")
  })

  test("ignores a suspended reseller tenant's hiddenChannels entirely", async () => {
    root = { status: "active", hiddenChannels: [] }
    owned = { status: "suspended", hiddenChannels: ["zalo"] }

    const visible = await tenantService.resolveVisibleChannels("reseller-1")

    expect(visible).toContain("zalo")
  })
})
