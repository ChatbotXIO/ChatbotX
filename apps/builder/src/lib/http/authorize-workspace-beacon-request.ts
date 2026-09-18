import { NextResponse } from "next/server"
import { getCurrentUserId } from "@/lib/auth/utils"
import { isCrossSiteRequest } from "./same-site-request"

export type AuthorizedWorkspaceBeaconSession = {
  userId: string
}

/**
 * Shared same-site + auth gate for the small, unauthenticated-looking POST
 * routes fed by `navigator.sendBeacon` (which cannot invoke a
 * next-safe-action server action) — `api/whatsapp-voip-call-hangup` and
 * `api/workspace-presence/sign-off` both need the exact same two checks.
 *
 * Deliberately runs BEFORE the caller parses its JSON body: the same-site
 * and session checks depend on nothing in the body, so a request that fails
 * either one must never even reach `req.json()` — a cross-site or
 * unauthenticated caller with a malformed/incomplete body still gets 403 or
 * 401, never a 400 that would leak "your body shape was wrong" to a request
 * that was never going to be authorized anyway.
 *
 * Workspace membership is intentionally NOT part of this helper: it needs
 * the body-derived `workspaceId`, so each caller parses its body first and
 * then calls `assertCurrentUserCanAccessChatbot` itself (throws a
 * `ChatbotXException`, mapped to a 4xx by the caller's
 * `serverErrorHandler`).
 */
export async function authorizeWorkspaceBeaconSession(
  req: Request,
): Promise<AuthorizedWorkspaceBeaconSession | NextResponse> {
  if (isCrossSiteRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return { userId }
}
