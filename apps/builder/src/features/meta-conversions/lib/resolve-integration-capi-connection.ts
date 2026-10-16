import type { MetaConversionsIntegration } from "@chatbotx.io/business"
import {
  type CapiConnection,
  resolveCapiConnection,
} from "@chatbotx.io/business/meta-conversions/connection-state"

type StoredCapiColumns = Pick<
  MetaConversionsIntegration,
  "capiDisconnectedAt" | "capiAccessToken" | "datasetId" | "hasCapiScope"
>

/**
 * The connection state of a loaded integration row. Only the *presence* of the
 * encrypted token is read, so a page can derive the state server-side and pass
 * plain booleans and ids down to a client component — the ciphertext never
 * leaves the server.
 */
export function resolveIntegrationCapiConnection(
  channel: Parameters<typeof resolveCapiConnection>[0],
  integration: StoredCapiColumns,
): CapiConnection {
  return resolveCapiConnection(channel, {
    capiDisconnectedAt: integration.capiDisconnectedAt,
    hasCapiAccessToken: Boolean(integration.capiAccessToken),
    datasetId: integration.datasetId,
    hasCapiScope: integration.hasCapiScope,
  })
}
