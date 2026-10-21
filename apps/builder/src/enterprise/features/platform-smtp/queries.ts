import {
  assertEnterpriseFeatures,
  isSuperAdmin,
  platformCredentialService,
} from "@chatbotx.io/business"
import type { SmtpCredentialPublic } from "@chatbotx.io/database/partials"
import { notFound } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/utils"

export async function getPlatformSmtpSettings(): Promise<SmtpCredentialPublic | null> {
  // Defense in depth behind the (enterprise) route-group layout: the layout
  // only blocks page rendering, not direct invocations of this query.
  await assertEnterpriseFeatures()
  const user = await getCurrentUser()
  if (!(user && (await isSuperAdmin(user)))) {
    return notFound()
  }

  const row = await platformCredentialService.findPlatform({ type: "smtp" })
  return row?.publicConfig ?? null
}
