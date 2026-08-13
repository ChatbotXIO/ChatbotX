import { exportSPKI, generateKeyPair, SignJWT } from "jose"
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"
import { LICENSE_ISSUER } from "../src/enterprise/license/public-keys"
import type { LicenseKeyMap } from "../src/enterprise/license/service"

const KID = "test-license-key"
const NOW = new Date("2026-01-01T00:00:00.000Z")
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000)
const DAY_SECONDS = 24 * 60 * 60

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"]
let publicKeyPem: string
let keyMap: LicenseKeyMap

const defaultPrivateClaims = () => ({
  customerName: "Acme Corp",
  tier: "enterprise" as const,
  features: ["sso"] as const,
  limits: {
    maxWorkspaces: 7,
    maxSeats: null,
    maxChannels: 12,
  },
  licenseId: "lic_test_123",
})

const signLicense = ({
  exp = NOW_SECONDS + 31 * DAY_SECONDS,
  tier,
}: {
  exp?: number
  tier?: "enterprise" | "cloud"
} = {}) =>
  new SignJWT({
    ...defaultPrivateClaims(),
    ...(tier ? { tier } : {}),
  })
    .setProtectedHeader({ alg: "EdDSA", kid: KID, typ: "JWT" })
    .setIssuer(LICENSE_ISSUER)
    .setSubject("customer_123")
    .setIssuedAt(NOW_SECONDS - 60)
    .setExpirationTime(exp)
    .sign(privateKey)

const setEdition = (edition: string) => {
  process.env.NEXT_PUBLIC_EDITION = edition
}

const mockPublicKeys = () => {
  vi.doMock("../src/enterprise/license/public-keys", () => ({
    LICENSE_ISSUER,
    LICENSE_PUBLIC_KEYS: keyMap,
  }))
}

const importAssertLicenseAtStartup = async () => {
  const { assertLicenseAtStartup } = await import(
    "../src/enterprise/license/startup"
  )
  return assertLicenseAtStartup
}

describe("assertLicenseAtStartup", () => {
  beforeAll(async () => {
    const keyPair = await generateKeyPair("EdDSA", {
      crv: "Ed25519",
      extractable: true,
    })
    privateKey = keyPair.privateKey
    publicKeyPem = await exportSPKI(keyPair.publicKey)
    keyMap = { [KID]: publicKeyPem }
  })

  afterEach(() => {
    delete process.env.LICENSE_KEY
    delete process.env.NEXT_PUBLIC_EDITION
    vi.resetModules()
    vi.doUnmock("../src/enterprise/license/public-keys")
    vi.restoreAllMocks()
  })

  test("exits 1 when enterprise edition has no LICENSE_KEY", async () => {
    setEdition("enterprise")
    vi.resetModules()
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)
    const assertLicenseAtStartup = await importAssertLicenseAtStartup()

    await assertLicenseAtStartup()

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  test("exits 1 when enterprise edition has a malformed/wrong-signature token", async () => {
    setEdition("enterprise")
    const otherKeyPair = await generateKeyPair("EdDSA", {
      crv: "Ed25519",
      extractable: true,
    })
    process.env.LICENSE_KEY = await new SignJWT(defaultPrivateClaims())
      .setProtectedHeader({ alg: "EdDSA", kid: KID, typ: "JWT" })
      .setIssuer(LICENSE_ISSUER)
      .setSubject("customer_123")
      .setIssuedAt(NOW_SECONDS - 60)
      .setExpirationTime(NOW_SECONDS + DAY_SECONDS)
      .sign(otherKeyPair.privateKey)
    vi.resetModules()
    mockPublicKeys()
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)
    const assertLicenseAtStartup = await importAssertLicenseAtStartup()

    await assertLicenseAtStartup()

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  test("resolves without exiting for a valid enterprise license", async () => {
    setEdition("enterprise")
    process.env.LICENSE_KEY = await signLicense()
    vi.resetModules()
    mockPublicKeys()
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)
    const assertLicenseAtStartup = await importAssertLicenseAtStartup()

    await expect(assertLicenseAtStartup()).resolves.toBeUndefined()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  test("resolves with a warning (no exit) for an expired enterprise license", async () => {
    setEdition("enterprise")
    process.env.LICENSE_KEY = await signLicense({
      exp: NOW_SECONDS - 2 * DAY_SECONDS,
    })
    vi.resetModules()
    mockPublicKeys()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)
    const assertLicenseAtStartup = await importAssertLicenseAtStartup()

    await expect(assertLicenseAtStartup()).resolves.toBeUndefined()
    expect(exitSpy).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  test("never verifies or exits for community edition", async () => {
    setEdition("community")
    vi.resetModules()
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)
    const assertLicenseAtStartup = await importAssertLicenseAtStartup()

    await expect(assertLicenseAtStartup()).resolves.toBeUndefined()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  test("exits 1 when cloud edition has no LICENSE_KEY", async () => {
    setEdition("cloud")
    vi.resetModules()
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)
    const assertLicenseAtStartup = await importAssertLicenseAtStartup()

    await assertLicenseAtStartup()

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  test("resolves without exiting for a valid license on cloud edition", async () => {
    setEdition("cloud")
    process.env.LICENSE_KEY = await signLicense({ tier: "cloud" })
    vi.resetModules()
    mockPublicKeys()
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)
    const assertLicenseAtStartup = await importAssertLicenseAtStartup()

    await expect(assertLicenseAtStartup()).resolves.toBeUndefined()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  test("exits 1 when enterprise edition has a cloud-tier license", async () => {
    setEdition("enterprise")
    process.env.LICENSE_KEY = await signLicense({ tier: "cloud" })
    vi.resetModules()
    mockPublicKeys()
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)
    const assertLicenseAtStartup = await importAssertLicenseAtStartup()

    await assertLicenseAtStartup()

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  test("exits 1 when cloud edition has an enterprise-tier license", async () => {
    setEdition("cloud")
    process.env.LICENSE_KEY = await signLicense({ tier: "enterprise" })
    vi.resetModules()
    mockPublicKeys()
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)
    const assertLicenseAtStartup = await importAssertLicenseAtStartup()

    await assertLicenseAtStartup()

    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
