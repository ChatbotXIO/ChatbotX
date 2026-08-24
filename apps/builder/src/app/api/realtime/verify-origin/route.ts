import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { isAllowedOrigin } from "@/lib/oauth-referer"

/**
 * Resolves a client-supplied host to a trusted origin for `apps/realtime`.
 * Realtime is a PartyKit edge service with no database access, so it cannot
 * check `CustomDomain` itself — it asks the builder instead. Reuses the same
 * allowlist as `sanitizeReferer` (broker + builder URL + active custom
 * domains) so the two checks can never drift.
 *
 * Deliberately unauthenticated: the response only confirms whether a host is
 * one of this platform's own registered origins, information that is not
 * secret and is already discoverable via DNS/TLS.
 */
export async function GET(request: NextRequest) {
  const host = request.nextUrl.searchParams.get("host")
  if (!host) {
    return NextResponse.json({ allowed: false }, { status: 400 })
  }

  let candidate: URL
  try {
    candidate = new URL(`https://${host}`)
  } catch {
    return NextResponse.json({ allowed: false }, { status: 400 })
  }

  const allowed = await isAllowedOrigin(candidate)
  if (!allowed) {
    return NextResponse.json({ allowed: false }, { status: 404 })
  }

  return NextResponse.json(
    { allowed: true, origin: candidate.origin },
    { headers: { "Cache-Control": "private, max-age=60" } },
  )
}
