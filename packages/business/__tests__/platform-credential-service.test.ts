import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const tenantService = { findByOwner: vi.fn() }
vi.mock("../src/enterprise/tenant/service", () => ({ tenantService }))

vi.mock("@chatbotx.io/database/client", () => ({
  asc: vi.fn((value) => value),
  db: {},
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn((_strings: TemplateStringsArray, ...values: unknown[]) => values),
}))
vi.mock("@chatbotx.io/database/partials", () => ({
  credentialEncryptedSchema: { parse: vi.fn((value) => value) },
  credentialPublicSchemas: {},
  credentialSchemas: {
    threads: {},
  },
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  platformCredentialModel: {
    id: "id",
    livemode: "livemode",
    publicConfig: "publicConfig",
    type: "type",
    usePlatformCredential: "usePlatformCredential",
    userId: "userId",
  },
}))
vi.mock("@chatbotx.io/encryption", () => ({
  encryptUtils: { decryptObject: vi.fn(), encryptObject: vi.fn() },
}))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(async () => undefined),
  withCache: vi.fn(async (_key: string, fn: () => unknown) => fn()),
}))
vi.mock("../src/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

const { platformCredentialService } = await import(
  "../src/platform-credential/service"
)
const { encryptUtils } = await import("@chatbotx.io/encryption")

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

describe("resolveWhatsappSystemUserToken", () => {
  test("returns the systemUserToken from the resolved whatsapp credential", async () => {
    const resolve = vi
      .spyOn(platformCredentialService, "resolveForOwner")
      .mockResolvedValue({
        config: { systemUserToken: "sys-token-1" },
      } as never)

    const result =
      await platformCredentialService.resolveWhatsappSystemUserToken({
        ownerId: "owner-1",
      })

    expect(result).toBe("sys-token-1")
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "owner-1", type: "whatsapp" }),
    )
  })

  test("returns null when the owner has no whatsapp credential", async () => {
    vi.spyOn(platformCredentialService, "resolveForOwner").mockResolvedValue(
      undefined,
    )

    const result =
      await platformCredentialService.resolveWhatsappSystemUserToken({
        ownerId: "owner-1",
      })

    expect(result).toBeNull()
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

describe("resolvePlatformAppAccessToken", () => {
  test("returns clientId and clientSecret joined as a Meta app token", async () => {
    vi.spyOn(
      platformCredentialService,
      "findDecryptedPlatform",
    ).mockResolvedValue({
      config: { clientId: "client-1", clientSecret: "secret-1" },
    } as never)

    await expect(
      platformCredentialService.resolvePlatformAppAccessToken("messenger"),
    ).resolves.toBe("client-1|secret-1")
  })

  test("returns undefined when the platform credential is missing", async () => {
    vi.spyOn(
      platformCredentialService,
      "findDecryptedPlatform",
    ).mockResolvedValue(undefined)

    await expect(
      platformCredentialService.resolvePlatformAppAccessToken("instagram"),
    ).resolves.toBeUndefined()
  })
})

describe("findDecryptedThreadsByClientId", () => {
  test("queries non-delegated threads credentials and decrypts the first deterministic match", async () => {
    vi.mocked(encryptUtils.decryptObject).mockResolvedValue({
      clientId: "thread-app",
      clientSecret: "secret-1",
      verifyToken: "verify-1",
      version: "v1.0",
    })

    const row = {
      createdAt: new Date("2026-08-12T00:00:00Z"),
      id: "platform-row",
      livemode: false,
      publicConfig: { clientId: "thread-app" },
      type: "threads",
      updatedAt: new Date("2026-08-12T00:00:00Z"),
      userId: null,
      value: { encrypted: true },
    }

    const limit = vi.fn().mockResolvedValue([row])
    const orderBy = vi.fn(() => ({ limit }))
    const where = vi.fn(() => ({ orderBy }))
    const from = vi.fn(() => ({ where }))
    const tx = { select: vi.fn(() => ({ from })) } as never

    const result =
      await platformCredentialService.findDecryptedThreadsByClientId({
        clientId: "thread-app",
        tx,
      })

    expect(result).toEqual({
      config: {
        clientId: "thread-app",
        clientSecret: "secret-1",
        verifyToken: "verify-1",
        version: "v1.0",
      },
      createdAt: row.createdAt,
      id: "platform-row",
      publicConfig: { clientId: "thread-app" },
      type: "threads",
      updatedAt: row.updatedAt,
      userId: null,
    })
    expect(orderBy).toHaveBeenCalledOnce()
    expect(limit).toHaveBeenCalledWith(1)
    expect(encryptUtils.decryptObject).toHaveBeenCalledOnce()
  })

  test("returns undefined when no threads credential matches the clientId", async () => {
    const limit = vi.fn().mockResolvedValue([])
    const orderBy = vi.fn(() => ({ limit }))
    const where = vi.fn(() => ({ orderBy }))
    const from = vi.fn(() => ({ where }))
    const tx = { select: vi.fn(() => ({ from })) } as never

    await expect(
      platformCredentialService.findDecryptedThreadsByClientId({
        clientId: "missing-app",
        tx,
      }),
    ).resolves.toBeUndefined()
  })
})
