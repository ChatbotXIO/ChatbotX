import { buildContext } from "@chatbotx.io/business"
import { channelTypes } from "@chatbotx.io/database/partials"
import type { IntegrationMessengerModel } from "@chatbotx.io/database/types"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"

/** Messenger integration context for calling Graph APIs from a worker job. */
export function buildMessengerContext(props: {
  workspaceId: string
  integration: IntegrationMessengerModel
}) {
  const { workspaceId, integration } = props
  return buildContext({
    workspaceId,
    integrationType: channelTypes.enum.messenger,
    integration: {
      ...integration,
      auth: integration.auth as unknown as MessengerAuthValue,
    },
  })
}
