import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"

/**
 * Who may change the workspace's Google Ads connection: a workspace super
 * admin. A platform support session carries a synthetic `superAdmin: true`
 * membership (AGENTS.md invariant 19), so mutations that connect accounts or
 * send conversions to Google must also reject it explicitly.
 */
export async function assertCanManageGoogleAds(input: {
  workspaceId: string
  isSupportSession: boolean
}): Promise<void> {
  await assertWorkspaceSuperAdmin(input.workspaceId)
  if (input.isSupportSession) {
    const t = await getTranslations()
    throw new ChatbotXException(
      t("googleAds.errors.supportSession"),
      "googleAdsSupportSession",
      403,
    )
  }
}

/** Typed, translated refusal shared by the googleAds actions. */
export async function googleAdsException(
  key:
    | "developerTokenMissing"
    | "notConnected"
    | "sessionNotFound"
    | "pickFailed"
    | "notRetryable"
    | "authorizationUnavailable",
  httpStatusCode = 400,
): Promise<ChatbotXException> {
  const t = await getTranslations()
  return new ChatbotXException(
    t(`googleAds.errors.${key}`),
    `googleAds.${key}`,
    httpStatusCode,
  )
}
