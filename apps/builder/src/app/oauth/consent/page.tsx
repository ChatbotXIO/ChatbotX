import { mcpOAuthService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { OAuthConsentForm } from "@/features/oauth-consent/consent-form"
import { getCurrentUser } from "@/lib/auth/utils"

export const dynamic = "force-dynamic"

export default async function OAuthConsentPage(props: {
  searchParams: Promise<{
    client_id?: string
    consent_code?: string
    scope?: string
  }>
}) {
  const [{ client_id: clientId, consent_code: consentCode, scope }, user] =
    await Promise.all([props.searchParams, getCurrentUser()])
  if (!(clientId && consentCode && user)) {
    notFound()
  }

  const [client, workspaces] = await Promise.all([
    mcpOAuthService.findClient({ clientId }),
    mcpOAuthService.listAuthorizableWorkspaces({ userId: user.id }),
  ])
  const scopes = scope?.split(" ").filter(Boolean) ?? []

  return (
    <OAuthConsentForm
      clientId={clientId}
      clientName={client?.name || clientId}
      consentCode={consentCode}
      scopes={scopes}
      userEmail={user.email}
      workspaces={workspaces}
    />
  )
}
