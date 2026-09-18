import { NextResponse } from "next/server"
import { getCurrentUserId } from "@/lib/auth/utils"
import { isCrossSiteRequest } from "./same-site-request"

export type AuthorizedWorkspaceBeaconSession = {
  userId: string
}

/**
 * Shared same-site + auth gate for POST routes fed by `navigator.sendBeacon`
 * (which can't invoke a next-safe-action server action). Runs before the
 * caller parses its JSON body, so a cross-site or unauthenticated request
 * always gets 403/401, never a 400 that leaks body-shape info. Workspace
 * membership is intentionally NOT checked here — it needs the body-derived
 * `workspaceId`, so each caller parses its body first and calls
 * `assertCurrentUserCanAccessChatbot` itself.
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
