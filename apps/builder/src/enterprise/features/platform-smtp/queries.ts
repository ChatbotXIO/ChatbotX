import {
  assertEnterpriseFeatures,
  platformCredentialService,
} from "@chatbotx.io/business"
import type { SmtpCredentialPublic } from "@chatbotx.io/database/partials"
import { assertPlatformSuperAdmin } from "@/lib/auth/assert-platform-super-admin"

export async function getPlatformSmtpSettings(): Promise<SmtpCredentialPublic | null> {
  // Defense in depth behind the (enterprise) route-group layout: the layout
  // only blocks page rendering, not direct invocations of this query.
  await assertEnterpriseFeatures()
  await assertPlatformSuperAdmin()

  const row = await platformCredentialService.findPlatform({ type: "smtp" })
  return row?.publicConfig ?? null
}
