import { contactScanService } from "@chatbotx.io/business"
import type { ContactScanChannel } from "@chatbotx.io/utils/channel"
import type {
  ListContactScanHistoryItem,
  ListContactScanHistoryResponse,
} from "../schema/query"

/**
 * Shared scan-history adapter (no where-builders, no `db`) for the private
 * scan-history page query and the public `GET /v1/contact-scans` handler.
 */
export async function listContactScanHistoryRows(input: {
  workspaceId: string
  integrationId?: string
  page?: number
  perPage?: number
  sort?: { id: string; desc: boolean }[]
}): Promise<ListContactScanHistoryResponse> {
  const { data, pageCount } = await contactScanService.listHistory({
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    page: input.page ?? undefined,
    perPage: input.perPage ?? undefined,
    sort: input.sort ?? undefined,
  })

  return {
    data: data.map(
      (item): ListContactScanHistoryItem => ({
        ...item,
        // A `type='contact_scan'` row can never carry a channel outside
        // `CONTACT_SCAN_CHANNELS` — narrow it to the wire's scan-only type.
        channel: item.channel as ContactScanChannel,
      }),
    ),
    pageCount,
  }
}
