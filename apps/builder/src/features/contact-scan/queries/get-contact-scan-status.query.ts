import { contactScanService } from "@chatbotx.io/business"
import type {
  ContactScanRunStatus,
  GetContactScanStatusRequest,
  GetContactScanStatusResponse,
} from "../schema/query"

/**
 * Thin request adapter (no where-builders, no `db`) — shapes
 * `ContactScanService.getStatus`'s response into the wire contract.
 */
export async function getContactScanStatus(
  input: GetContactScanStatusRequest,
): Promise<GetContactScanStatusResponse> {
  const { workspaceId, inboxId } = input
  const view = await contactScanService.getStatus({ workspaceId, inboxId })

  return {
    // `CoexistRunStatus` structurally carries `waiting` (WhatsApp-only), but
    // a `type='contact_scan'` row can never be set to it — narrowing to the
    // wire's scan-only status type here is safe (see schema/query.ts).
    status: view.status as GetContactScanStatusResponse["status"],
    latest: view.latest
      ? {
          ...view.latest,
          status: view.latest.status as ContactScanRunStatus,
        }
      : null,
    availability: view.availability,
  }
}
