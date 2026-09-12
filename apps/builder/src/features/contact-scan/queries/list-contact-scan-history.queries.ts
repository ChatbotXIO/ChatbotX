import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { listContactScanHistoryRows } from "../lib/contact-scan-history"
import { requireUnrestrictedContactsScope } from "../lib/require-unrestricted-contacts-scope"
import type {
  ListContactScanHistoryRequest,
  ListContactScanHistoryResponse,
} from "../schema/query"

/**
 * Thin request adapter (no where-builders, no `db`) for the Automatic
 * Customer Scan history page — mirrors `listImports`
 * (`features/import/queries/list-imports.queries.ts`), plus the
 * unrestricted-contacts scope gate the scan page/action/status API already
 * enforce (plan §7 decision 10): an assigned-only member must not see
 * Page-wide scan history either. Delegates the actual service call to
 * `listContactScanHistoryRows` (`../lib/contact-scan-history`), shared with
 * the public `GET /v1/contact-scans` handler.
 */
export async function listContactScanHistory(
  input: ListContactScanHistoryRequest & { workspaceId: string },
): Promise<ListContactScanHistoryResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  await requireUnrestrictedContactsScope(input.workspaceId)

  return await listContactScanHistoryRows({
    workspaceId: input.workspaceId,
    page: input.page ?? undefined,
    perPage: input.perPage ?? undefined,
    sort: input.sort ?? undefined,
  })
}
