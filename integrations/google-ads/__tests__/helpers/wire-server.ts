import { createServer, type IncomingMessage, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, beforeEach } from "vitest"
import type * as ClientModule from "../../src/client"
import type * as ConstantsModule from "../../src/constants"
import type { GoogleAdsAuthValue } from "../../src/schemas"

/**
 * Shared harness of the wire-contract tests: the REAL code (ky, http-client,
 * zod parsing, google-auth-library) talks over real HTTP to a local server that
 * impersonates Google Ads, Data Manager and Google OAuth. Response bodies are
 * written after the official REST references (proto3 JSON: lowerCamelCase,
 * int64 as strings, enums as strings, default-valued fields omitted;
 * searchStream answers a JSON ARRAY of batches). Nothing below the network
 * boundary is mocked.
 */

export type Recorded = {
  method: string
  path: string
  query: URLSearchParams
  headers: IncomingMessage["headers"]
  raw: string
  json: unknown
}

export type Reply = {
  status?: number
  json?: unknown
  raw?: string
  contentType?: string
  /** Drops the connection without answering (network failure). */
  destroy?: boolean
}

let server: Server
const state = { origin: "" }
const routes = new Map<string, (req: Recorded) => Reply>()
/** Mutated in place (never reassigned) so importers keep a live reference. */
export const requests: Recorded[] = []

export const wireOrigin = (): string => state.origin

/** Body of the `../src/constants` mock: redirects the API base URLs. */
export const mockConstants = (actual: typeof ConstantsModule) => ({
  ...actual,
  get GOOGLE_ADS_API_URL() {
    return `${state.origin}/v25/`
  },
  get DATA_MANAGER_API_URL() {
    return `${state.origin}/v1/`
  },
})

/** Body of the `../src/client` mock: real OAuth2Client, documented endpoints redirected. */
export const mockClient = (actual: typeof ClientModule) => ({
  ...actual,
  getClient: (...args: Parameters<typeof actual.getClient>) => {
    const client = actual.getClient(...args)
    Object.assign(client, {
      endpoints: {
        ...client.endpoints,
        tokenInfoUrl: `${state.origin}/oauth/tokeninfo`,
        oauth2TokenUrl: `${state.origin}/oauth/token`,
        oauth2RevokeUrl: `${state.origin}/oauth/revoke`,
      },
    })
    return client
  },
})

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let data = ""
    req.on("data", (chunk) => {
      data += chunk
    })
    req.on("end", () => resolve(data))
  })

const safeJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return
  }
}

/** Registers the server lifecycle hooks in the calling test file. */
export const useWireServer = () => {
  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", state.origin)
      const raw = await readBody(req)
      const recorded: Recorded = {
        method: req.method ?? "GET",
        path: url.pathname,
        query: url.searchParams,
        headers: req.headers,
        raw,
        json: safeJson(raw),
      }
      requests.push(recorded)
      const handler = routes.get(`${recorded.method} ${recorded.path}`)
      const reply: Reply = handler
        ? handler(recorded)
        : { status: 404, json: { error: { code: 404, status: "NOT_FOUND" } } }
      if (reply.destroy) {
        req.socket.destroy()
        return
      }
      res.statusCode = reply.status ?? 200
      res.setHeader("content-type", reply.contentType ?? "application/json")
      res.end(reply.raw ?? JSON.stringify(reply.json ?? {}))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    state.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => {
    server.close()
  })

  beforeEach(() => {
    requests.length = 0
    routes.clear()
  })
}

export const route = (
  key: string,
  reply: Reply | ((req: Recorded) => Reply),
) => {
  routes.set(key, typeof reply === "function" ? reply : () => reply)
}

export const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
export const REVOKE_FAILED = /revoke failed/

export const ADS = "/v25"
export const STREAM = (id: string) =>
  `POST ${ADS}/customers/${id}/googleAds:searchStream`
export const LIST_ACCESSIBLE = `GET ${ADS}/customers:listAccessibleCustomers`
export const INGEST = "POST /v1/events:ingest"
export const LEGACY_UPLOAD = (customerId: string) =>
  `POST ${ADS}/customers/${customerId}:uploadClickConversions`
export const STATUS = "GET /v1/requestStatus:retrieve"

export const MANAGER = "1111111111"
export const DIRECT = "2222222222"
export const CLIENT_A = "3333333333"
export const CLIENT_B = "4444444444"

export const credentials = {
  accessToken: "ya29.access",
  developerToken: "dev-token-abc",
}

export const batch = (results: unknown[], requestId = "req-1") => ({
  results,
  fieldMask: "customer.id",
  requestId,
})

export const customerRow = (
  id: string,
  extra: Record<string, unknown> = {},
) => ({
  customer: {
    resourceName: `customers/${id}`,
    id,
    descriptiveName: `Account ${id}`,
    currencyCode: "USD",
    status: "ENABLED",
    ...extra,
  },
})

export const googleAdsFailure = (
  httpCode: number,
  status: string,
  errorCode: Record<string, string>,
  message: string,
) => ({
  error: {
    code: httpCode,
    message,
    status,
    details: [
      {
        "@type":
          "type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure",
        errors: [{ errorCode, message }],
        requestId: "wire-request-id",
      },
    ],
  },
})

export const baseAuth = (): GoogleAdsAuthValue => ({
  authType: "oauth2",
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUrl: "https://app.example.test/callback",
  tokens: { accessToken: "ya29.access", refreshToken: "1//refresh" },
  metadata: { developerToken: "dev-token-abc", accountId: "g-1" },
})
