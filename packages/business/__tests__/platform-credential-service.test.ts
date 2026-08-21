import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const tenantService = { findByOwner: vi.fn() }
vi.mock("../src/enterprise/tenant/service", () => ({ tenantService }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
}))
const credentialSchemas = {
  instagram: { name: "instagram-schema" },
  messenger: { name: "messenger-schema" },
}
const credentialPublicSchemas = {
  messenger: { parse: vi.fn((value: unknown) => value) },
}
const credentialEncryptedSchema = {
  parse: vi.fn((value: unknown) => value),
}
// Mirrors the real credentialAad from @chatbotx.io/database/partials inline
// rather than via importOriginal (importing real database-package modules in
// vitest mocks risks opening a DB connection). The exact-string assertions in
// the upsert tests below lock this format to the real implementation's.
const credentialAad = (props: {
  userId?: string | null
  type: string
  livemode: boolean
}) =>
  props.userId
    ? `user:${props.userId}:${props.type}:${props.livemode}`
    : `platform:${props.type}:${props.livemode}`
vi.mock("@chatbotx.io/database/partials", () => ({
  credentialAad,
  credentialEncryptedSchema,
  credentialPublicSchemas,
  credentialSchemas,
}))
vi.mock("@chatbotx.io/database/schema", () => ({ platformCredentialModel: {} }))
const encryptUtils = { decryptObject: vi.fn(), encryptObject: vi.fn() }
vi.mock("@chatbotx.io/encryption", () => ({ encryptUtils }))
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
  encryptUtils.decryptObject.mockReset()
  encryptUtils.encryptObject.mockReset()
  credentialEncryptedSchema.parse.mockClear()
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

describe("_decrypt", () => {
  // decryptObject takes no aad argument: it reads the aad off the blob
  // itself (see packages/encryption/src/encryption.ts decryptText), so
  // `_decrypt` doesn't need to re-derive the row-scoped aad the writers
  // stamped — it just passes the blob and schema through.
  test("decrypts a platform-scoped row", async () => {
    encryptUtils.decryptObject.mockResolvedValue({ clientId: "client-1" })

    await expect(
      (platformCredentialService as never)._decrypt({
        id: "platform-1",
        userId: null,
        type: "instagram",
        livemode: false,
        value: { encrypted: true },
        publicConfig: { clientId: "client-1" },
        createdAt: new Date("2026-08-13T00:00:00.000Z"),
        updatedAt: new Date("2026-08-13T00:00:00.000Z"),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "platform-1",
        userId: null,
        type: "instagram",
        config: { clientId: "client-1" },
      }),
    )

    expect(encryptUtils.decryptObject).toHaveBeenCalledTimes(1)
    expect(encryptUtils.decryptObject).toHaveBeenCalledWith(
      { encrypted: true },
      credentialSchemas.instagram,
    )
  })

  test("decrypts a user-scoped row", async () => {
    encryptUtils.decryptObject.mockResolvedValue({ clientId: "client-2" })

    await expect(
      (platformCredentialService as never)._decrypt({
        id: "user-1",
        userId: "owner-1",
        type: "messenger",
        livemode: true,
        value: { encrypted: true },
        publicConfig: { clientId: "client-2" },
        createdAt: new Date("2026-08-13T00:00:00.000Z"),
        updatedAt: new Date("2026-08-13T00:00:00.000Z"),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "user-1",
        userId: "owner-1",
        type: "messenger",
        config: { clientId: "client-2" },
      }),
    )

    expect(encryptUtils.decryptObject).toHaveBeenCalledTimes(1)
    expect(encryptUtils.decryptObject).toHaveBeenCalledWith(
      { encrypted: true },
      credentialSchemas.messenger,
    )
  })
})

// Fakes a minimal chainable drizzle-style tx sufficient for
// upsertForUser/upsertPlatform's `.insert().values().onConflictDoUpdate()`
// call shape, without needing a real DB client.
const fakeTx = () => {
  const tx = {
    insert: vi.fn(() => tx),
    values: vi.fn(() => tx),
    onConflictDoUpdate: vi.fn(() => Promise.resolve()),
  }
  return tx as unknown as Parameters<
    typeof platformCredentialService.upsertForUser
  >[0]["tx"]
}

describe("upsertForUser / upsertPlatform write path", () => {
  // Writers still stamp a row-derived aad at encrypt time — only decrypt
  // stopped taking one. These assertions lock in that the derivation
  // (user:<id>:<type>:<livemode> / platform:<type>:<livemode>) still reaches
  // encryptObject unchanged.
  test("upsertForUser encrypts with a row-derived aad", async () => {
    encryptUtils.encryptObject.mockResolvedValue({
      v: 1,
      iv: "iv",
      text: "text",
      tag: "tag",
      aad: "user:owner-1:messenger:false",
    })
    vi.spyOn(
      platformCredentialService,
      "invalidateCacheTags",
    ).mockResolvedValue(undefined)

    await platformCredentialService.upsertForUser({
      userId: "owner-1",
      type: "messenger",
      config: { clientId: "c", clientSecret: "s" } as never,
      tx: fakeTx(),
    })

    expect(encryptUtils.encryptObject).toHaveBeenCalledWith(
      { clientId: "c", clientSecret: "s" },
      "user:owner-1:messenger:false",
    )
  })

  test("upsertPlatform encrypts with a platform-scoped aad", async () => {
    encryptUtils.encryptObject.mockResolvedValue({
      v: 1,
      iv: "iv",
      text: "text",
      tag: "tag",
      aad: "platform:messenger:false",
    })
    vi.spyOn(
      platformCredentialService,
      "invalidateCacheTags",
    ).mockResolvedValue(undefined)

    await platformCredentialService.upsertPlatform({
      type: "messenger",
      config: { clientId: "c", clientSecret: "s" } as never,
      tx: fakeTx(),
    })

    expect(encryptUtils.encryptObject).toHaveBeenCalledWith(
      { clientId: "c", clientSecret: "s" },
      "platform:messenger:false",
    )
  })
})
