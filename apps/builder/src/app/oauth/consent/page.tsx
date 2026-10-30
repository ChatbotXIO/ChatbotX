import { mcpOAuthService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { notFound } from "next/navigation"
import { OAuthConsentForm } from "@/features/oauth-consent/consent-form"
import { getCurrentUser } from "@/lib/auth/utils"

export const dynamic = "force-dynamic"

export default async function OAuthConsentPage(props: {
  searchParams: Promise<{
    consent_code?: string
    scope?: string
  }>
}) {
  const [{ consent_code: consentCode, scope }, user] = await Promise.all([
    props.searchParams,
    getCurrentUser(),
  ])
  if (!(consentCode && user)) {
    notFound()
  }

  let consentRequest: { clientId: string }
  try {
    consentRequest = await mcpOAuthService.resolveConsentRequest({
      consentCode,
      userId: user.id,
    })
  } catch (error) {
    if (
      error instanceof ChatbotXException &&
      (error.code === "notFound" || error.code === "forbidden")
    ) {
      notFound()
    }
    throw error
  }

  const [workspaces, client] = await Promise.all([
    mcpOAuthService.listAuthorizableWorkspaces({ userId: user.id }),
    mcpOAuthService.findClient({ clientId: consentRequest.clientId }),
  ])
  const scopes = scope?.split(" ").filter(Boolean) ?? []

  return (
    <OAuthConsentForm
      clientName={client?.name || consentRequest.clientId}
      consentCode={consentCode}
      scopes={scopes}
      userEmail={user.email}
      workspaces={workspaces}
    />
  )
}
