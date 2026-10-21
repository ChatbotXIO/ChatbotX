import {
  HttpResponse,
  http,
  server as mswServer,
} from "@chatbotx.io/vitest-config/msw"
import { exportSPKI, generateKeyPair, SignJWT } from "jose"
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"
import { LICENSE_ISSUER } from "../src/enterprise/license/public-keys"
import { mockLicenseRepository } from "./helpers/license"

const KID = "test-license-key"
const DAY_SECONDS = 24 * 60 * 60
const LICENSE_ID = "lic_test_123"
const REFRESH_URL = "https://licenses.test/refresh"

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"]
let publicKeyPem: string

const signLicense = async ({
  licenseId = LICENSE_ID,
  issuedAt = Math.floor(Date.now() / 1000) - 60,
  expiresAt = issuedAt + 31 * DAY_SECONDS,
}: {
  licenseId?: string
  issuedAt?: number
  expiresAt?: number
} = {}): Promise<{ expiresAt: string; token: string }> => {
  const token = await new SignJWT({
    customerName: "Acme Corp",
    tier: "enterprise",
    features: ["sso"],
    limits: {
      maxWorkspaces: 7,
      maxSeats: null,
      maxChannels: 12,
    },
    licenseId,
  })
    .setProtectedHeader({ alg: "EdDSA", kid: KID, typ: "JWT" })
    .setIssuer(LICENSE_ISSUER)
    .setSubject("customer_123")
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(privateKey)

  return { token, expiresAt: new Date(expiresAt * 1000).toISOString() }
}

const importLicenseRefresh = async ({
  edition = "enterprise",
  envToken,
  refreshEnabled = true,
  storedToken,
}: {
  edition?: "community" | "enterprise" | "cloud"
  envToken: string
  refreshEnabled?: boolean
  storedToken?: string
}) => {
  process.env.LICENSE_KEY = envToken
  process.env.LICENSE_REFRESH_URL = REFRESH_URL
  process.env.NEXT_PUBLIC_EDITION = edition
  if (refreshEnabled) {
    delete process.env.LICENSE_REFRESH_ENABLED
  } else {
    process.env.LICENSE_REFRESH_ENABLED = "false"
  }

  vi.resetModules()
  vi.doMock("../src/enterprise/license/public-keys", () => ({
    LICENSE_ISSUER,
    LICENSE_PUBLIC_KEYS: { [KID]: publicKeyPem },
  }))
  const repository = mockLicenseRepository(storedToken)

  // These modules read mocked dependencies at import time.
  const { getLicenseStatus } = await import("../src/enterprise/license/service")
  const { refreshLicense } = await import("../src/enterprise/license/refresh")

  return { getLicenseStatus, refreshLicense, repository }
}

describe("license refresh", () => {
  beforeAll(async () => {
    const keyPair = await generateKeyPair("EdDSA", {
      crv: "Ed25519",
      extractable: true,
    })
    privateKey = keyPair.privateKey
    publicKeyPem = await exportSPKI(keyPair.publicKey)
  })

  afterEach(() => {
    delete process.env.LICENSE_KEY
    delete process.env.LICENSE_REFRESH_ENABLED
    delete process.env.LICENSE_REFRESH_URL
    delete process.env.NEXT_PUBLIC_EDITION
    mswServer.resetHandlers()
    vi.resetModules()
    vi.doUnmock("@chatbotx.io/database/repositories")
    vi.doUnmock("../src/enterprise/license/public-keys")
    vi.unstubAllGlobals()
  })

  test("persists a renewed token and makes it visible without a restart", async () => {
    const storedTokens = new Map<string, string>()
    const envLicense = await signLicense()
    const renewedLicense = await signLicense({
      issuedAt: Math.floor(Date.now() / 1000),
    })
    const { getLicenseStatus, refreshLicense, repository } =
      await importLicenseRefresh({ envToken: envLicense.token })
    repository.findTokenByLicenseId.mockImplementation(async (licenseId) =>
      storedTokens.get(licenseId),
    )
    repository.upsert.mockImplementation(
      ({ licenseId, token }: { licenseId: string; token: string }) => {
        storedTokens.set(licenseId, token)
      },
    )
    const receivedRequests: unknown[] = []
    mswServer.use(
      http.post(REFRESH_URL, async ({ request }) => {
        receivedRequests.push(await request.json())
        return HttpResponse.json({ token: renewedLicense.token })
      }),
    )

    await expect(refreshLicense()).resolves.toEqual({
      status: "refreshed",
      expiresAt: renewedLicense.expiresAt,
    })
    expect(receivedRequests).toEqual([
      {
        token: envLicense.token,
        licenseId: LICENSE_ID,
        edition: "enterprise",
      },
    ])
    await expect(getLicenseStatus()).resolves.toMatchObject({
      state: "valid",
      expiresAt: renewedLicense.expiresAt,
    })
  })

  test("accepts a renewal with the same expiry and a newer issuance", async () => {
    const issuedAt = Math.floor(Date.now() / 1000) - 120
    const expiresAt = issuedAt + 31 * DAY_SECONDS
    const envLicense = await signLicense({ issuedAt, expiresAt })
    const renewedLicense = await signLicense({
      issuedAt: issuedAt + 60,
      expiresAt,
    })
    const { refreshLicense, repository } = await importLicenseRefresh({
      envToken: envLicense.token,
    })
    mswServer.use(
      http.post(REFRESH_URL, () =>
        HttpResponse.json({ token: renewedLicense.token }),
      ),
    )

    await expect(refreshLicense()).resolves.toEqual({
      status: "refreshed",
      expiresAt: renewedLicense.expiresAt,
    })
    expect(repository.upsert).toHaveBeenCalledWith({
      licenseId: LICENSE_ID,
      token: renewedLicense.token,
      expiresAt: new Date(renewedLicense.expiresAt),
    })
  })

  test("returns unchanged when the vendor returns the same token", async () => {
    const envLicense = await signLicense()
    const { refreshLicense, repository } = await importLicenseRefresh({
      envToken: envLicense.token,
    })
    mswServer.use(
      http.post(REFRESH_URL, () =>
        HttpResponse.json({ token: envLicense.token }),
      ),
    )

    await expect(refreshLicense()).resolves.toEqual({
      status: "unchanged",
      expiresAt: envLicense.expiresAt,
    })
    expect(repository.upsert).not.toHaveBeenCalled()
  })

  test("keeps the stored token when the vendor returns 402", async () => {
    const envLicense = await signLicense()
    const storedLicense = await signLicense({
      issuedAt: Math.floor(Date.now() / 1000),
    })
    const { refreshLicense, repository } = await importLicenseRefresh({
      envToken: envLicense.token,
      storedToken: storedLicense.token,
    })
    mswServer.use(
      http.post(REFRESH_URL, () => new HttpResponse(null, { status: 402 })),
    )

    await expect(refreshLicense()).resolves.toEqual({
      status: "failed",
      reason: "http_402",
    })
    expect(repository.upsert).not.toHaveBeenCalled()
  })

  test("returns badBody when the vendor response is not JSON", async () => {
    const envLicense = await signLicense()
    const { refreshLicense } = await importLicenseRefresh({
      envToken: envLicense.token,
    })
    mswServer.use(http.post(REFRESH_URL, () => HttpResponse.text("not json")))

    await expect(refreshLicense()).resolves.toEqual({
      status: "failed",
      reason: "badBody",
    })
  })

  test("rejects a token issued for another license", async () => {
    const envLicense = await signLicense()
    const mismatchedLicense = await signLicense({ licenseId: "lic_other" })
    const { refreshLicense, repository } = await importLicenseRefresh({
      envToken: envLicense.token,
    })
    mswServer.use(
      http.post(REFRESH_URL, () =>
        HttpResponse.json({ token: mismatchedLicense.token }),
      ),
    )

    await expect(refreshLicense()).resolves.toEqual({
      status: "failed",
      reason: "rejectedToken",
    })
    expect(repository.upsert).not.toHaveBeenCalled()
  })

  test("skips the vendor request when refresh is disabled", async () => {
    const envLicense = await signLicense()
    const { refreshLicense } = await importLicenseRefresh({
      envToken: envLicense.token,
      refreshEnabled: false,
    })

    await expect(refreshLicense()).resolves.toEqual({
      status: "skipped",
      reason: "disabled",
    })
  })

  test("skips the vendor request on community edition", async () => {
    const envLicense = await signLicense()
    const { refreshLicense } = await importLicenseRefresh({
      edition: "community",
      envToken: envLicense.token,
    })

    await expect(refreshLicense()).resolves.toEqual({
      status: "skipped",
      reason: "community",
    })
  })

  test("returns an HTTP failure when response cancellation fails", async () => {
    const envLicense = await signLicense()
    const { refreshLicense } = await importLicenseRefresh({
      envToken: envLicense.token,
    })
    const cancel = vi.fn().mockRejectedValue(new Error("stream already closed"))
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        body: { cancel },
        ok: false,
        status: 502,
      }),
    )

    await expect(refreshLicense()).resolves.toEqual({
      status: "failed",
      reason: "http_502",
    })
    expect(cancel).toHaveBeenCalledTimes(1)
  })
  test("returns requestFailed when the vendor is unreachable", async () => {
    const envLicense = await signLicense()
    const { refreshLicense } = await importLicenseRefresh({
      envToken: envLicense.token,
    })
    mswServer.use(http.post(REFRESH_URL, () => HttpResponse.error()))

    await expect(refreshLicense()).resolves.toEqual({
      status: "failed",
      reason: "requestFailed",
    })
  })
})
