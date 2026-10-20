import { createServer } from "node:http"
import type { AddressInfo, Server } from "node:net"
import {
  http,
  server as mswServer,
  passthrough,
} from "@chatbotx.io/vitest-config/msw"
import { exportSPKI, generateKeyPair, SignJWT } from "jose"
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import { LICENSE_ISSUER } from "../src/enterprise/license/public-keys"

const KID = "test-license-key"
const DAY_SECONDS = 24 * 60 * 60
const LICENSE_ID = "lic_test_123"

type StoredLicense = {
  token: string
  expiresAt: Date
}

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"]
let publicKeyPem: string
let responseStatus = 200
let responseToken = ""
let responseBody: string | undefined
let server: Server
let refreshUrl: string
const receivedRequests: unknown[] = []

const signLicense = async ({
  licenseId = LICENSE_ID,
  expiresInDays,
}: {
  licenseId?: string
  expiresInDays: number
}): Promise<{ expiresAt: string; token: string }> => {
  const issuedAt = Math.floor(Date.now() / 1000)
  const expiresAt = issuedAt + expiresInDays * DAY_SECONDS
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

describe("license refresh", () => {
  beforeAll(async () => {
    const keyPair = await generateKeyPair("EdDSA", {
      crv: "Ed25519",
      extractable: true,
    })
    privateKey = keyPair.privateKey
    publicKeyPem = await exportSPKI(keyPair.publicKey)
    server = createServer((request, response) => {
      let body = ""
      request.on("data", (chunk: Buffer) => {
        body += chunk
      })
      request.on("end", () => {
        receivedRequests.push(JSON.parse(body))
        response.writeHead(responseStatus, {
          "content-type": "application/json",
        })
        response.end(
          responseBody ??
            JSON.stringify(
              responseStatus === 200
                ? { token: responseToken }
                : { error: "unpaid" },
            ),
        )
      })
    })
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject)
        const address = server.address() as AddressInfo
        refreshUrl = `http://127.0.0.1:${address.port}`
        resolve()
      })
    })
  })

  afterEach(() => {
    delete process.env.LICENSE_KEY
    delete process.env.LICENSE_REFRESH_ENABLED
    delete process.env.LICENSE_REFRESH_URL
    delete process.env.NEXT_PUBLIC_EDITION
    vi.resetModules()
    vi.doUnmock("@chatbotx.io/database/repositories")
    vi.doUnmock("../src/enterprise/license/public-keys")
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  })

  test("persists a renewed token and makes it visible without a restart", async () => {
    const storedLicenses = new Map<string, StoredLicense>()
    const upsert = vi.fn((license: StoredLicense & { licenseId: string }) => {
      storedLicenses.set(license.licenseId, license)
    })
    const envLicense = await signLicense({ expiresInDays: 2 })
    const renewedLicense = await signLicense({ expiresInDays: 37 })
    const mismatchedLicense = await signLicense({
      licenseId: "lic_other",
      expiresInDays: 45,
    })
    responseToken = renewedLicense.token
    responseStatus = 200
    receivedRequests.length = 0
    responseBody = undefined
    process.env.LICENSE_KEY = envLicense.token
    process.env.LICENSE_REFRESH_URL = refreshUrl
    process.env.NEXT_PUBLIC_EDITION = "enterprise"
    vi.resetModules()
    vi.doMock("../src/enterprise/license/public-keys", () => ({
      LICENSE_ISSUER,
      LICENSE_PUBLIC_KEYS: { [KID]: publicKeyPem },
    }))
    vi.doMock("@chatbotx.io/database/repositories", () => ({
      licenseRepository: {
        findByLicenseId: vi.fn(async (licenseId: string) =>
          storedLicenses.get(licenseId),
        ),
        upsert,
      },
    }))
    const { getLicenseStatus } = await import(
      "../src/enterprise/license/service"
    )
    const { refreshLicense } = await import("../src/enterprise/license/refresh")
    mswServer.use(http.post(refreshUrl, () => passthrough()))

    await expect(refreshLicense()).resolves.toMatchObject({
      status: "refreshed",
      expiresAt: renewedLicense.expiresAt,
    })
    expect(storedLicenses.get(LICENSE_ID)).toMatchObject({
      token: renewedLicense.token,
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

    responseStatus = 402
    await expect(refreshLicense()).resolves.toMatchObject({
      status: "failed",
      reason: "http_402",
    })
    expect(storedLicenses.get(LICENSE_ID)).toMatchObject({
      token: renewedLicense.token,
    })
    await expect(getLicenseStatus()).resolves.toMatchObject({
      state: "valid",
      expiresAt: renewedLicense.expiresAt,
    })

    responseStatus = 200
    responseBody = "not json"
    await expect(refreshLicense()).resolves.toEqual({
      status: "failed",
      reason: "badBody",
    })
    expect(upsert).toHaveBeenCalledTimes(1)
    responseBody = undefined

    responseStatus = 200
    responseToken = mismatchedLicense.token
    await expect(refreshLicense()).resolves.toEqual({
      status: "failed",
      reason: "rejectedToken",
    })
    expect(upsert).toHaveBeenCalledTimes(1)

    const requestCountBeforeCommunity = receivedRequests.length
    process.env.NEXT_PUBLIC_EDITION = "community"
    await expect(refreshLicense()).resolves.toEqual({
      status: "skipped",
      reason: "community",
    })
    expect(receivedRequests).toHaveLength(requestCountBeforeCommunity)
  })
})
