import { mcpOAuthService } from "@chatbotx.io/business"
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

  const [consentRequest, workspaces] = await Promise.all([
    mcpOAuthService.resolveConsentRequest({
      consentCode,
      userId: user.id,
    }),
    mcpOAuthService.listAuthorizableWorkspaces({ userId: user.id }),
  ])
  const client = await mcpOAuthService.findClient({
    clientId: consentRequest.clientId,
  })
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
