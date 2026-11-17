import { userService } from "@chatbotx.io/business"
import { tenantOwnerEmailReservedException } from "@chatbotx.io/business/errors"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import { resolveTenantOwnerId } from "./tenant-context"

/**
 * Throws `tenantOwnerEmailReserved` when `email` is the email of the user who
 * owns `tenantId`. A sub-account row with the owner's email would shadow the
 * owner's own account inside their tenant. The root tenant has no single
 * owner, so it is never restricted. Comparison is case-insensitive.
 */
export async function assertNotTenantOwnerEmail(props: {
  email: string
  tenantId: string
}): Promise<void> {
  if (props.tenantId === ROOT_TENANT_ID) {
    return
  }
  const ownerId = await resolveTenantOwnerId(props.tenantId)
  if (!ownerId) {
    return
  }
  const ownerEmail = await userService.findEmailCached(ownerId)
  if (ownerEmail && ownerEmail.toLowerCase() === props.email.toLowerCase()) {
    throw tenantOwnerEmailReservedException()
  }
}
