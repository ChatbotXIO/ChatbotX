import type { InboundWebhookAction } from "@chatbotx.io/database/partials"
import { findInvalidActionReferences } from "../automation-action/references"

/**
 * Whether every flow, tag, custom field (by id) and bot field the actions point at
 * belongs to the workspace. A webhook must not be saved with another
 * workspace's ids: the worker scopes its writes anyway, but the owner should
 * hear about a wrong id when saving, not discover it in the request log.
 */
export const actionReferencesExistInWorkspace = async (input: {
  workspaceId: string
  actions: InboundWebhookAction[]
}): Promise<boolean> => (await findInvalidActionReferences(input)).length === 0
