import { verifyMinigameReferralToken } from "@chatbotx.io/encryption/minigame-referral-token"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import type { NextRequest } from "next/server"
import {
  MINIGAME_REFERRAL_COOKIE_MAX_AGE,
  minigameReferralCookieName,
} from "@/features/minigames/lib/referral-cookie"

/**
 * Landing hop for a shared minigame invite link.
 *
 * Exists as a route handler rather than being folded into the play page
 * because Next.js only permits cookie writes from Route Handlers and Server
 * Actions — never during a Server Component's render. Inherits public access
 * from `proxy.ts`'s `"/minigames"` prefix (`isPublicRoute` is a bare
 * `startsWith`), so no proxy change is needed.
 *
 * The recipient is an anonymous visitor with no `Contact` yet, so they cannot
 * play from here. All this does is remember who invited them; the referral is
 * bound later, when they become a contact and open their own play link.
 */
export async function GET(request: NextRequest) {
  const minigameId = request.nextUrl.searchParams.get("minigameId")
  const ref = request.nextUrl.searchParams.get("ref")

  if (!(minigameId && ref)) {
    redirect("/minigames")
  }

  const payload = await verifyMinigameReferralToken(ref).catch(() => null)
  if (!payload || payload.minigameId !== minigameId) {
    redirect(`/minigames?minigameId=${minigameId}&invited=expired`)
  }

  const cookieStore = await cookies()
  cookieStore.set(minigameReferralCookieName(minigameId), ref, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Not `strict`: the click arrives as a cross-site top-level GET from
    // Messenger/Zalo, and `strict` would drop the cookie on exactly the hop
    // that sets it and on the later play-link hop.
    sameSite: "lax",
    maxAge: MINIGAME_REFERRAL_COOKIE_MAX_AGE,
    // Covers both this writer and the `/minigames` reader, and keeps the
    // cookie off every other request in the app.
    path: "/minigames",
  })

  redirect(`/minigames?minigameId=${minigameId}&invited=1`)
}
