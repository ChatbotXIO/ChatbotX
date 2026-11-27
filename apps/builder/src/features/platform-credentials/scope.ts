import { canUseOwnCredentials, isSuperAdmin } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { UserModel } from "@chatbotx.io/database/types"
import { z } from "zod"
import { isCloud } from "@/env"

export const credentialScopeSchema = z.enum(["user", "platform"])
export type CredentialScope = z.infer<typeof credentialScopeSchema>

/**
 * Resolve the DB `userId` scope for a credential read/write.
 *
 * - `"platform"` → NULL (global default credentials). Requires super admin.
 * - `"user"`     → the caller's own credentials in cloud, or the platform-global
 *                  credentials when self-hosted. Preserves the historical
 *                  white-label `/manage` behavior.
 */
export const resolveCredentialScopedUserId = async (
  user: UserModel,
  scope: CredentialScope,
  options?: { allowWithoutEntitlement?: boolean },
): Promise<string | undefined> => {
  if (scope === "platform") {
    if (!(await isSuperAdmin(user))) {
      throw new ChatbotXException("Unauthorized", "unauthorized", 403)
    }
    return
  }
  if (
    isCloud() &&
    !options?.allowWithoutEntitlement &&
    !(await canUseOwnCredentials(user.id))
  ) {
    throw new ChatbotXException("Unauthorized", "unauthorized", 403)
  }
  return isCloud() ? user.id : undefined
}
