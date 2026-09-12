import {
  type FreeswitchXmlCredentials,
  renderFreeswitchXml,
  resolveFreeswitchNodeXmlCredentials,
} from "@chatbotx.io/business"
import { timingSafeStringEqual } from "@chatbotx.io/utils/crypto"
import { type NextRequest, NextResponse } from "next/server"
import { env } from "@/env"
import { resolveFreeswitchNodes } from "@/lib/freeswitch/nodes"
import { logger } from "@/lib/log"
import {
  checkFreeswitchXmlRateLimit,
  getFreeswitchClientIp,
  isIpAllowlisted,
} from "@/lib/rate-limit/freeswitch-xml-rate-limit"

const NOT_FOUND_DOCUMENT =
  '<document type="freeswitch/xml"><section name="result"><result status="not found"/></section></document>'

const xmlResponse = (body: string, status = 200): NextResponse =>
  new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })

/**
 * Deny-by-default guard: `/api` is already in `proxy.ts`
 * `publicRoutes`, so this route is reachable without a session — every
 * check below must pass before any DB read. Nothing here ever logs the
 * request body or the rendered XML (SIP digest passwords).
 */
/**
 * Production requires PROOF of TLS, not merely the absence of a plain-HTTP
 * hint: either this server terminated TLS itself, or a configured trusted
 * proxy asserted `x-forwarded-proto: https`. A request carrying the shared
 * secret over plain HTTP (or an unverifiable header) is refused.
 */
function assertHttps(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== "production") {
    return null
  }
  const terminatedHere = new URL(request.url).protocol === "https:"
  // A Next.js route handler never sees the TCP peer, so "trusted proxy"
  // can only mean: the deployment's ingress OVERWRITES client-supplied
  // X-Forwarded-* headers (standard nginx/traefik/cloud-LB behaviour) and
  // FS_XML_TRUSTED_PROXY_CIDRS names it. Without that guarantee neither the
  // proto header nor the forwarded IP is trusted — and Basic auth (bound to
  // the node's own secret) remains the real gate either way.
  const trustedProxyConfigured =
    (env.FS_XML_TRUSTED_PROXY_CIDRS ?? []).length > 0
  const proxyAssertsHttps =
    trustedProxyConfigured &&
    request.headers.get("x-forwarded-proto") === "https"
  return terminatedHere || proxyAssertsHttps
    ? null
    : new NextResponse(null, { status: 403 })
}

function parseBasicAuth(
  header: string | null,
): { user: string; pass: string } | null {
  if (!header?.startsWith("Basic ")) {
    return null
  }
  let decoded: string
  try {
    decoded = Buffer.from(header.slice("Basic ".length), "base64").toString(
      "utf8",
    )
  } catch {
    return null
  }
  const separatorIndex = decoded.indexOf(":")
  if (separatorIndex < 0) {
    return null
  }
  return {
    user: decoded.slice(0, separatorIndex),
    pass: decoded.slice(separatorIndex + 1),
  }
}

/**
 * Authenticates the request against the credentials of the node it CLAIMS
 * to be (`hostname` form field = FreeSWITCH `switchname`). A caller
 * holding node A's secret therefore cannot pull node B's gateway XML and
 * SIP passwords — the secret is bound to exactly one node. Unknown or
 * unconfigured nodes fail closed with the same 401 as bad credentials.
 */
function assertAuthorized(
  request: NextRequest,
  nodeId: string,
): NextResponse | null {
  let expected: FreeswitchXmlCredentials | null = null
  try {
    expected = resolveFreeswitchNodeXmlCredentials(
      resolveFreeswitchNodes(),
      nodeId,
      {
        user: env.FS_XML_BASIC_USER,
        pass: env.FS_XML_BASIC_PASS,
      },
    )
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : "unknown", nodeId },
      "FreeSWITCH xml_curl node credentials misconfigured",
    )
  }
  if (!expected) {
    // Not configured / unknown node — refuse rather than accept everything.
    return new NextResponse(null, { status: 401 })
  }

  const credentials = parseBasicAuth(request.headers.get("authorization"))
  const isAuthorized =
    credentials !== null &&
    timingSafeStringEqual(credentials.user, expected.user) &&
    timingSafeStringEqual(credentials.pass, expected.pass)

  if (!isAuthorized) {
    return new NextResponse(null, {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="freeswitch-xml"' },
    })
  }
  return null
}

/**
 * IP allowlist check — defence-in-depth ON TOP OF Basic auth (`assertAuthorized`),
 * never a substitute for it. `getFreeswitchClientIp` only returns a real,
 * non-spoofable address when `FS_XML_TRUSTED_PROXY_CIDRS` is configured; when
 * it returns `null` there is no trustworthy peer IP to check, so this
 * SKIPS the allowlist rather than trust a client-supplied header (a
 * one-time startup warning is logged from `getFreeswitchClientIp` itself).
 */
function assertAllowedSource(request: NextRequest): NextResponse | null {
  const clientIp = getFreeswitchClientIp(
    request.headers,
    env.FS_XML_TRUSTED_PROXY_CIDRS ?? [],
  )
  if (clientIp === null) {
    return null
  }

  const allowedIps = env.FS_XML_ALLOWED_IPS ?? []
  const isAllowlisted = isIpAllowlisted(clientIp, allowedIps)
  return isAllowlisted ? null : new NextResponse(null, { status: 403 })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const httpsError = assertHttps(request)
  if (httpsError) {
    return httpsError
  }

  // The body is read BEFORE authentication only to learn which node the
  // caller claims to be (`hostname`) — nothing in it is trusted until the
  // node-bound credentials check below passes, and it is never logged.
  let form: URLSearchParams
  try {
    form = new URLSearchParams(await request.text())
  } catch {
    logger.warn("FreeSWITCH xml_curl request body could not be read")
    return new NextResponse(null, { status: 400 })
  }
  const nodeId = form.get("hostname") ?? ""

  const authError = assertAuthorized(request, nodeId)
  if (authError) {
    // The limiter exists to slow down credential guessing, never to
    // throttle FreeSWITCH itself — so only FAILED auth attempts count. A
    // trustworthy IP keys the bucket when we have one; a shared bucket
    // otherwise (the limiter never trusts a spoofable header as identity).
    const trustedProxyCidrs = env.FS_XML_TRUSTED_PROXY_CIDRS ?? []
    const rateLimitKey =
      (trustedProxyCidrs.length > 0
        ? getFreeswitchClientIp(request.headers, trustedProxyCidrs)
        : null) ?? "unverified-source"
    const rateLimit = await checkFreeswitchXmlRateLimit({
      clientIp: rateLimitKey,
    })
    if (rateLimit.limited) {
      return new NextResponse(null, {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfter) },
      })
    }
    return authError
  }

  const sourceError = assertAllowedSource(request)
  if (sourceError) {
    return sourceError
  }

  const parsedRequest: Record<string, string> = {}
  for (const [key, value] of form.entries()) {
    parsedRequest[key] = value
  }

  try {
    const xml = await renderFreeswitchXml(parsedRequest, {
      nodes: resolveFreeswitchNodes(),
      recordingsDir: env.FS_RECORDINGS_DIR,
      maxRingTargets: env.FS_MAX_RING_TARGETS,
    })
    return xmlResponse(xml)
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : "unknown" },
      "FreeSWITCH xml_curl responder failed to render",
    )
    return xmlResponse(NOT_FOUND_DOCUMENT)
  }
}
