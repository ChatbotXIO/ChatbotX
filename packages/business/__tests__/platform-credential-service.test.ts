import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const tenantService = { findByOwner: vi.fn() }
vi.mock("../src/enterprise/tenant/service", () => ({ tenantService }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
}))
vi.mock("@chatbotx.io/database/partials", () => ({
  credentialEncryptedSchema: {},
  credentialPublicSchemas: {},
  credentialSchemas: {},
}))
vi.mock("@chatbotx.io/database/schema", () => ({ platformCredentialModel: {} }))
vi.mock("@chatbotx.io/encryption", () => ({ encryptUtils: {} }))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(async () => undefined),
  withCache: vi.fn(async (_key: string, fn: () => unknown) => fn()),
}))
vi.mock("../src/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

const { platformCredentialService } = await import(
  "../src/platform-credential/service"
)

const OWN = { id: "own", type: "messenger", publicConfig: { clientId: "own" } }
const PLATFORM = {
  id: "plat",
  type: "messenger",
  publicConfig: { clientId: "plat" },
}

beforeEach(() => {
  tenantService.findByOwner.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("resolveForOwner", () => {
  test("active tenant with own credential returns the reseller's own", async () => {
    tenantService.findByOwner.mockResolvedValue({ status: "active" })
    const own = vi
      .spyOn(platformCredentialService, "findDecryptedForUser")
      .mockResolvedValue(OWN as never)
    const platform = vi.spyOn(
      platformCredentialService,
      "findDecryptedPlatform",
    )

    const result = await platformCredentialService.resolveForOwner({
      ownerId: "owner-1",
      type: "messenger",
    })

    expect(result).toBe(OWN)
    expect(own).toHaveBeenCalledTimes(1)
    expect(platform).not.toHaveBeenCalled()
  })

  test("active tenant WITHOUT own credential falls back to platform", async () => {
    tenantService.findByOwner.mockResolvedValue({ status: "active" })
    vi.spyOn(
      platformCredentialService,
      "findDecryptedForUser",
    ).mockResolvedValue(undefined)
    const platform = vi
      .spyOn(platformCredentialService, "findDecryptedPlatform")
      .mockResolvedValue(PLATFORM as never)

    const result = await platformCredentialService.resolveForOwner({
      ownerId: "owner-1",
      type: "messenger",
    })

    expect(result).toBe(PLATFORM)
    expect(platform).toHaveBeenCalledTimes(1)
  })

  test("inactive tenant uses platform without reading own credential", async () => {
    tenantService.findByOwner.mockResolvedValue({ status: "suspended" })
    const own = vi.spyOn(platformCredentialService, "findDecryptedForUser")
    const platform = vi
      .spyOn(platformCredentialService, "findDecryptedPlatform")
      .mockResolvedValue(PLATFORM as never)

    const result = await platformCredentialService.resolveForOwner({
      ownerId: "owner-1",
      type: "messenger",
    })

    expect(result).toBe(PLATFORM)
    expect(own).not.toHaveBeenCalled()
    expect(platform).toHaveBeenCalledTimes(1)
  })
})

describe("resolvePublicForUser", () => {
  test("own credential set returns it as not inherited", async () => {
    vi.spyOn(platformCredentialService, "findForUser").mockResolvedValue(
      OWN as never,
    )
    const platform = vi.spyOn(platformCredentialService, "findPlatform")

    const result = await platformCredentialService.resolvePublicForUser({
      userId: "user-1",
      type: "messenger",
    })

    expect(result).toEqual({
      publicConfig: OWN.publicConfig,
      isInherited: false,
    })
    expect(platform).not.toHaveBeenCalled()
  })

  test("no own credential falls back to platform as inherited", async () => {
    vi.spyOn(platformCredentialService, "findForUser").mockResolvedValue(
      undefined,
    )
    vi.spyOn(platformCredentialService, "findPlatform").mockResolvedValue(
      PLATFORM as never,
    )

    const result = await platformCredentialService.resolvePublicForUser({
      userId: "user-1",
      type: "messenger",
    })

    expect(result).toEqual({
      publicConfig: PLATFORM.publicConfig,
      isInherited: true,
    })
  })

  test("own credential flagged usePlatformCredential falls back to platform", async () => {
    vi.spyOn(platformCredentialService, "findForUser").mockResolvedValue({
      ...OWN,
      usePlatformCredential: true,
    } as never)
    vi.spyOn(platformCredentialService, "findPlatform").mockResolvedValue(
      PLATFORM as never,
    )

    const result = await platformCredentialService.resolvePublicForUser({
      userId: "user-1",
      type: "messenger",
    })

    expect(result?.isInherited).toBe(true)
  })

  test("neither own nor platform returns undefined", async () => {
    vi.spyOn(platformCredentialService, "findForUser").mockResolvedValue(
      undefined,
    )
    vi.spyOn(platformCredentialService, "findPlatform").mockResolvedValue(
      undefined,
    )

    const result = await platformCredentialService.resolvePublicForUser({
      userId: "user-1",
      type: "messenger",
    })

    expect(result).toBeUndefined()
  })
})
