import "server-only"
import { paymentProviderService } from "@chatbotx.io/business"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"

/**
 * The workspace's connected Stripe / PayPal accounts (never a secret), and
 * whether its platform has Stripe Connect set up at all — what the API and
 * the Integrations rows both show.
 */
export async function getPaymentProviders(workspace: WorkspaceModel) {
  const [data, stripeAvailable] = await Promise.all([
    paymentProviderService.list(workspace.id),
    resolveOwnerForWorkspace(workspace).then((ownerId) =>
      paymentProviderService.isStripeAvailable(ownerId),
    ),
  ])
  return { data, stripeAvailable }
}
