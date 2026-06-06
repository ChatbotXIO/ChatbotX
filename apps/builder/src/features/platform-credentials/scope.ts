import { isSuperAdmin } from "@chatbotx.io/business"
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
export function resolveCredentialScopedUserId(
  user: UserModel,
  scope: CredentialScope,
): string | undefined {
  if (scope === "platform") {
    if (!isSuperAdmin(user)) {
      throw new Error("Unauthorized")
    }
    return
  }
  return isCloud() ? user.id : undefined
}
