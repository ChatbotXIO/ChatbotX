import { exportSPKI, generateKeyPair, generateSecret, SignJWT } from "jose"
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"
import { LICENSE_ISSUER } from "../src/enterprise/license/public-keys"
import {
  type LicenseKeyMap,
  verifyLicenseToken,
} from "../src/enterprise/license/service"

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
  features: ["sso", "customBranding"] as const,
  limits: {
    maxWorkspaces: 7,
    maxSeats: null,
    maxChannels: 12,
  },
  licenseId: "lic_test_123",
})

const signLicense = ({
  kid = KID,
  key = privateKey,
  claims = {},
  iat = NOW_SECONDS - 60,
  exp = NOW_SECONDS + 31 * DAY_SECONDS,
  nbf,
}: {
  kid?: string
  key?: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"]
  claims?: Record<string, unknown>
  iat?: number
  exp?: number
  nbf?: number
} = {}) => {
  let jwt = new SignJWT({
    ...defaultPrivateClaims(),
    ...claims,
  })
    .setProtectedHeader({ alg: "EdDSA", kid, typ: "JWT" })
    .setIssuer(LICENSE_ISSUER)
    .setSubject("customer_123")
    .setIssuedAt(iat)
    .setExpirationTime(exp)

  if (nbf) {
    jwt = jwt.setNotBefore(nbf)
  }

  return jwt.sign(key)
}

const tamperPayload = (token: string): string => {
  const [header, payload, signature] = token.split(".")
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  claims.licenseId = "lic_tampered"

  return [
    header,
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    signature,
  ].join(".")
}

describe("enterprise license verification", () => {
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
    vi.resetModules()
    vi.doUnmock("../src/enterprise/license/public-keys")
  })

  test("returns valid status for an Ed25519 signed license", async () => {
    const token = await signLicense()

    const status = await verifyLicenseToken(token, keyMap, { currentDate: NOW })

    expect(status).toMatchObject({
      state: "valid",
      licenseId: "lic_test_123",
      customerName: "Acme Corp",
      tier: "enterprise",
      features: ["sso", "customBranding"],
      limits: {
        maxWorkspaces: 7,
        maxSeats: null,
        maxChannels: 12,
      },
      issuedAt: new Date((NOW_SECONDS - 60) * 1000).toISOString(),
      expiresAt: new Date(
        (NOW_SECONDS + 31 * DAY_SECONDS) * 1000,
      ).toISOString(),
      daysRemaining: 31,
      keyId: KID,
      error: null,
    })
  })

  test("surfaces signed claims for an expired license", async () => {
    const token = await signLicense({
      exp: NOW_SECONDS - 2 * DAY_SECONDS,
    })

    const status = await verifyLicenseToken(token, keyMap, { currentDate: NOW })

    expect(status).toMatchObject({
      state: "expired",
      licenseId: "lic_test_123",
      customerName: "Acme Corp",
      keyId: KID,
      daysRemaining: -2,
    })
    expect(status.error).toContain("exp")
  })

  test("rejects a tampered payload", async () => {
    const token = tamperPayload(await signLicense())

    const status = await verifyLicenseToken(token, keyMap, { currentDate: NOW })

    expect(status.state).toBe("invalid")
    expect(status.licenseId).toBeNull()
    expect(status.error).toBeTruthy()
  })

  test("rejects a token signed with the wrong key", async () => {
    const otherKeyPair = await generateKeyPair("EdDSA", {
      crv: "Ed25519",
      extractable: true,
    })
    const token = await signLicense({ key: otherKeyPair.privateKey })

    const status = await verifyLicenseToken(token, keyMap, { currentDate: NOW })

    expect(status).toMatchObject({
      state: "invalid",
      licenseId: null,
      keyId: KID,
    })
  })

  test("rejects an unknown key id", async () => {
    const token = await signLicense({ kid: "unknown-key" })

    const status = await verifyLicenseToken(token, keyMap, { currentDate: NOW })

    expect(status).toMatchObject({
      state: "invalid",
      keyId: "unknown-key",
      error: "Unknown license key id: unknown-key",
    })
  })

  test("rejects non-EdDSA algorithms before verification", async () => {
    const secret = await generateSecret("HS256")
    const token = await new SignJWT(defaultPrivateClaims())
      .setProtectedHeader({ alg: "HS256", kid: KID, typ: "JWT" })
      .setIssuer(LICENSE_ISSUER)
      .setSubject("customer_123")
      .setIssuedAt(NOW_SECONDS - 60)
      .setExpirationTime(NOW_SECONDS + DAY_SECONDS)
      .sign(secret)

    const status = await verifyLicenseToken(token, keyMap, { currentDate: NOW })

    expect(status).toMatchObject({
      state: "invalid",
      keyId: KID,
      error: "License token must use EdDSA",
    })
  })

  test("rejects a signed license with invalid payload shape", async () => {
    const token = await signLicense({
      claims: {
        limits: {
          maxWorkspaces: -1,
          maxSeats: null,
          maxChannels: 12,
        },
      },
    })

    const status = await verifyLicenseToken(token, keyMap, { currentDate: NOW })

    expect(status.state).toBe("invalid")
    expect(status.error).toContain("Too small")
  })

  test("rejects a license that is not active yet", async () => {
    const token = await signLicense({
      nbf: NOW_SECONDS + DAY_SECONDS,
    })

    const status = await verifyLicenseToken(token, keyMap, { currentDate: NOW })

    expect(status).toMatchObject({
      state: "invalid",
      keyId: KID,
    })
    expect(status.error).toContain("nbf")
  })

  test("loads LICENSE_KEY once and exposes feature and limit accessors", async () => {
    process.env.LICENSE_KEY = await signLicense({
      exp: NOW_SECONDS + 400 * DAY_SECONDS,
    })
    vi.resetModules()
    vi.doMock("../src/enterprise/license/public-keys", () => ({
      LICENSE_ISSUER,
      LICENSE_PUBLIC_KEYS: keyMap,
    }))
    const { getLicenseStatus, getLimit, hasFeature } = await import(
      "../src/enterprise/license/service"
    )

    const status = await getLicenseStatus()

    expect(status.state).toBe("valid")
    expect(await getLimit("maxWorkspaces")).toBe(7)
    expect(await getLimit("maxSeats")).toBeNull()
    expect(await hasFeature("sso")).toBe(true)
    expect(await hasFeature("auditLog")).toBe(false)
  })

  test("reports missing when LICENSE_KEY is unset", async () => {
    delete process.env.LICENSE_KEY
    vi.resetModules()
    const { getLicenseStatus } = await import(
      "../src/enterprise/license/service"
    )

    await expect(getLicenseStatus()).resolves.toMatchObject({
      state: "missing",
      error: "LICENSE_KEY is not configured",
    })
  })
})
