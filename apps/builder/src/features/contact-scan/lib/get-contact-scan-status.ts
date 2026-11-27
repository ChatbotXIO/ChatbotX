import { contactScanService } from "@chatbotx.io/business"
import type {
  GetContactScanStatusRequest,
  GetContactScanStatusResponse,
} from "../schema/query"

/**
 * Shared status adapter for the private and public
 * `GET .../contact-scans/status` handlers (no where-builders, no `db`) —
 * shapes `ContactScanService.getStatus`'s response into the wire contract.
 */
export async function getContactScanStatus(
  input: GetContactScanStatusRequest,
): Promise<GetContactScanStatusResponse> {
  const { workspaceId, inboxId } = input
  return await contactScanService.getStatus({ workspaceId, inboxId })
}
