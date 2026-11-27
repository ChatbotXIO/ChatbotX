import {
  type FetchRoutingRoles,
  integrationWhatsappService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { RoutingRolesSnapshot } from "@chatbotx.io/database/partials"
import { getRoutingRoles } from "@chatbotx.io/integration-whatsapp/api/routing-roles"
import { logger } from "@/lib/log"

/** The `ChatbotXException` code a failed Meta lookup surfaces as. */
export const ROUTING_ROLES_UNAVAILABLE_CODE = "routingRolesUnavailable"

/**
 * Provider-facing lookup built from the primitives the business service hands
 * back — the builder layer is the only one allowed to depend on
 * `@chatbotx.io/integration-whatsapp` (same split as `coexist-trigger-sync`).
 */
const fetchRoutingRoles: FetchRoutingRoles = ({
  accessToken,
  version,
  phoneNumberId,
}) =>
  getRoutingRoles({ auth: { tokens: { accessToken }, version }, phoneNumberId })

/**
 * Asks Meta which Conversation Routing roles this app holds on a WhatsApp
 * number and stores the answer. Shared by the builder (settings card) and the
 * public API so both return the same snapshot. A Meta failure becomes a 502
 * `routingRolesUnavailable` and keeps the previously stored snapshot.
 */
export async function syncWhatsappRoutingRoles(input: {
  workspaceId: string
  integrationWhatsappId: string
}): Promise<RoutingRolesSnapshot> {
  try {
    return await integrationWhatsappService.syncRoutingRoles({
      id: input.integrationWhatsappId,
      workspaceId: input.workspaceId,
      fetchRoutingRoles,
    })
  } catch (error) {
    if (error instanceof ChatbotXException) {
      throw error
    }
    logger.warn(
      { err: error, integrationWhatsappId: input.integrationWhatsappId },
      "[whatsappRoutingRoles] Meta routing_roles lookup failed",
    )
    const reason = error instanceof Error ? error.message : "unknown error"
    throw new ChatbotXException(
      `Meta did not return the routing roles (${reason}). Try again.`,
      ROUTING_ROLES_UNAVAILABLE_CODE,
      502,
    )
  }
}
