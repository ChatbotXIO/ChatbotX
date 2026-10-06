import type { NextRequest } from "next/server"
import { startChannelConnect } from "@/features/channel-connect/lib/start-channel-connect"

/**
 * Reached only via a redirect from `/channels/create?channel=instagram-facebook`
 * (never linked to directly) — see the sibling `channels/instagram/route.ts`
 * for why this can't stay inline in `channels/create/page.tsx`.
 */
export async function GET(req: NextRequest) {
  return await startChannelConnect(req, {
    provider: "instagramFacebook",
    selectPath: (sessionId) =>
      `/channels/instagram-facebook/select?session=${sessionId}`,
  })
}
