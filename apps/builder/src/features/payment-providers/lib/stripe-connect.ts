import "server-only"
import { paymentProviderService } from "@chatbotx.io/business"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { sanitizeReferer } from "@/lib/oauth-referer"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { buildProviderCallbackUrl } from "@/lib/provider-origin"

/** Where Stripe sends the store owner back; registered in the platform's Connect settings. */
export const STRIPE_CONNECT_CALLBACK_PATH = "/integrations/stripe/callback"

/** A provider's row on Settings → Integrations. */
export const paymentIntegrationPath = (
  workspaceId: string,
  provider: "stripe" | "paypal",
) => `/space/${workspaceId}/settings/integrations/${provider}`

/** The workspace's Stripe row on Settings → Integrations. */
export const stripeIntegrationPath = (workspaceId: string) =>
  paymentIntegrationPath(workspaceId, "stripe")

/**
 * The Stripe Connect page for a workspace, on the platform's (or its
 * reseller's) Connect app. The redirect URI is the one the app registered:
 * the broker for the platform's app, the reseller's domain for their own.
 * `returnTo` is where the callback lands, kept only when it is a host we
 * control.
 */
export async function createStripeConnectLink(input: {
  workspace: WorkspaceModel
  /** The super admin who pressed Connect; only they can finish it. */
  userId: string
  returnTo: string
  email?: string | null
}): Promise<{ url: string; expiresAt: Date }> {
  const platform = await paymentProviderService.resolveStripePlatform(
    await resolveOwnerForWorkspace(input.workspace),
  )
  const redirectUri = await buildProviderCallbackUrl(
    { userId: platform.userId },
    STRIPE_CONNECT_CALLBACK_PATH,
  )
  return await paymentProviderService.createStripeConnectLink({
    workspaceId: input.workspace.id,
    userId: input.userId,
    platform,
    redirectUri,
    returnTo: await sanitizeReferer(input.returnTo),
    email: input.email,
  })
}
