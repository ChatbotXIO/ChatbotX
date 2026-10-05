import type { NextRequest } from "next/server"
import { startChannelConnect } from "@/features/channel-connect/lib/start-channel-connect"

/**
 * Reached only via a redirect from `/channels/create?channel=instagram-direct`
 * (never linked to directly) — a Server Component's render can't itself
 * start a `ConnectSession` down a path that could redirect to
 * `/channels/create?error=...` (see `createFirstWorkspace`), so this hands
 * off to `startChannelConnect`, shared with the sibling
 * `instagram-facebook`/`create/messenger` routes.
 */
export async function GET(req: NextRequest) {
  return await startChannelConnect(req, {
    provider: "instagram",
    selectPath: (sessionId) =>
      `/channels/instagram/select?session=${sessionId}`,
  })
}
