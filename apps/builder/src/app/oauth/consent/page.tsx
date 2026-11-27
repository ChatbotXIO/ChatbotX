import { verifyMcpOAuthQuery } from "@chatbotx.io/auth/mcp-resource"
import { mcpOAuthService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { OAuthConsentForm } from "@/features/oauth-consent/consent-form"
import { getCurrentUser } from "@/lib/auth/utils"

export const dynamic = "force-dynamic"

export default async function OAuthConsentPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [searchParams, user] = await Promise.all([
    props.searchParams,
    getCurrentUser(),
  ])
  if (!user) {
    notFound()
  }

  const oauthQuery = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    for (const item of typeof value === "string" ? [value] : (value ?? [])) {
      oauthQuery.append(key, item)
    }
  }
  const query = oauthQuery.toString()
  const verified = await verifyMcpOAuthQuery(query)
  if (!verified) {
    notFound()
  }

  const [workspaces, client] = await Promise.all([
    mcpOAuthService.listAuthorizableWorkspaces({ userId: user.id }),
    mcpOAuthService.findClient({ clientId: verified.clientId }),
  ])

  return (
    <OAuthConsentForm
      clientName={client?.name || verified.clientId}
      oauthQuery={query}
      scopes={verified.scopes}
      userEmail={user.email}
      workspaces={workspaces}
    />
  )
}
