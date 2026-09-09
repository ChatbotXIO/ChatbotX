import { contactScanService } from "@chatbotx.io/business"
import type { ContactScanChannel } from "@chatbotx.io/utils/channel"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { requireUnrestrictedContactsScope } from "../lib/require-unrestricted-contacts-scope"
import type {
  ContactScanRunStatus,
  ListContactScanHistoryItem,
  ListContactScanHistoryRequest,
  ListContactScanHistoryResponse,
} from "../schema/query"

/**
 * Thin request adapter (no where-builders, no `db`) for the Automatic
 * Customer Scan history page — mirrors `listImports`
 * (`features/import/queries/list-imports.queries.ts`), plus the
 * unrestricted-contacts scope gate the scan page/action/status API already
 * enforce (plan §7 decision 10): an assigned-only member must not see
 * Page-wide scan history either.
 */
export async function listContactScanHistory(
  input: ListContactScanHistoryRequest & { workspaceId: string },
): Promise<ListContactScanHistoryResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  await requireUnrestrictedContactsScope(input.workspaceId)

  const { data, pageCount } = await contactScanService.listHistory({
    workspaceId: input.workspaceId,
    page: input.page ?? undefined,
    perPage: input.perPage ?? undefined,
    sort: input.sort ?? undefined,
  })

  return {
    data: data.map(
      (item): ListContactScanHistoryItem => ({
        ...item,
        // A `type='contact_scan'` row can never carry the WhatsApp-only
        // `waiting` status, nor any channel outside `CONTACT_SCAN_CHANNELS`
        // — narrow both to the wire's scan-only types here, same as
        // `getContactScanStatus`.
        channel: item.channel as ContactScanChannel,
        status: item.status as ContactScanRunStatus,
      }),
    ),
    pageCount,
  }
}
