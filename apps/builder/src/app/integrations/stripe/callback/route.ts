import { paymentProviderService, workspaceService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getPublicUrlFromRequest } from "@chatbotx.io/utils"
import { redirect } from "next/navigation"
import type { NextRequest } from "next/server"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { getCurrentUser } from "@/lib/auth/utils"
import { logger } from "@/lib/log"
import { FALLBACK_REDIRECT, resolveRelayTarget } from "@/lib/oauth-referer"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"

export const dynamic = "force-dynamic"

/** `returnTo` with the outcome the Stripe row shows (`?stripe=connected`). */
const withOutcome = (returnTo: string, outcome: Record<string, string>) => {
  const [path, query = ""] = returnTo.split("?", 2)
  const params = new URLSearchParams(query)
  for (const [key, value] of Object.entries(outcome)) {
    params.set(key, value)
  }
  return `${path}?${params.toString()}`
}

/**
 * Stripe Connect sends the store owner back here with a `code`. In order:
 * 1. back to the host the connect started on (their session lives there),
 *    reading the `state` without using it;
 * 2. the `state` is taken — atomically, once — so the code is exchanged at
 *    most once (Stripe revokes the connection when a code is used twice);
 * 3. whoever lands here must be the member who pressed Connect, still a
 *    super admin of that workspace;
 * 4. the code is exchanged and the account saved for that workspace.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(getPublicUrlFromRequest(req))
  const state = url.searchParams.get("state") ?? ""

  const pending = await paymentProviderService.peekStripeConnectState(state)
  if (!pending) {
    return redirect(withOutcome(FALLBACK_REDIRECT, { stripe: "expired" }))
  }
  const relay = await resolveRelayTarget(url, pending.returnTo)
  if (relay) {
    return redirect(relay)
  }

  const connect = await paymentProviderService.takeStripeConnectState(state)
  if (!connect) {
    return redirect(withOutcome(pending.returnTo, { stripe: "expired" }))
  }
  const back = (outcome: Record<string, string>) =>
    redirect(withOutcome(connect.returnTo, outcome))

  const stripeError = url.searchParams.get("error")
  const code = url.searchParams.get("code")
  if (stripeError || !code) {
    return back({ stripe: "error", reason: stripeError ?? "missingCode" })
  }

  const user = await getCurrentUser()
  if (!user) {
    return back({ stripe: "error", reason: "signInRequired" })
  }
  // Only the member who pressed Connect: a callback URL someone approved with
  // their own Stripe account and passed on never connects it here.
  if (user.id !== connect.userId) {
    return back({ stripe: "error", reason: "startedByAnotherUser" })
  }
  try {
    await assertWorkspaceSuperAdmin(connect.workspaceId)
  } catch {
    return back({ stripe: "error", reason: "superAdminRequired" })
  }

  const workspace = await workspaceService.find({
    where: { id: connect.workspaceId },
  })
  if (!workspace) {
    return back({ stripe: "error", reason: "notFound" })
  }
  let outcome: Record<string, string>
  try {
    const connected = await paymentProviderService.completeStripeConnect({
      workspaceId: workspace.id,
      ownerId: await resolveOwnerForWorkspace(workspace),
      platformCredentialId: connect.platformCredentialId,
      code,
    })
    outcome =
      connected.chargesEnabled === false
        ? { stripe: "connected", chargesEnabled: "false" }
        : { stripe: "connected" }
  } catch (error) {
    if (!(error instanceof ChatbotXException)) {
      logger.error(
        { err: error, workspaceId: workspace.id },
        "[stripe-connect] the connection could not be completed",
      )
    }
    outcome = {
      stripe: "error",
      reason:
        error instanceof ChatbotXException ? error.code : "connectionFailed",
    }
  }
  return back(outcome)
}
