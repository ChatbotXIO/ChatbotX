import { verifyOAuthQueryParams } from "@better-auth/oauth-provider"
import { mcpOAuthService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { env } from "@/env"
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
  const clientId = searchParams.client_id
  if (!(typeof clientId === "string" && user)) {
    notFound()
  }

  const oauthQuery = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      oauthQuery.set(key, value)
      continue
    }
    for (const item of value ?? []) {
      oauthQuery.append(key, item)
    }
  }
  if (
    !(await verifyOAuthQueryParams(
      oauthQuery.toString(),
      env.BETTER_AUTH_SECRET,
    ))
  ) {
    notFound()
  }

  const [workspaces, client] = await Promise.all([
    mcpOAuthService.listAuthorizableWorkspaces({ userId: user.id }),
    mcpOAuthService.findClient({ clientId }),
  ])
  const scopes =
    typeof searchParams.scope === "string"
      ? searchParams.scope.split(" ").filter(Boolean)
      : []

  return (
    <OAuthConsentForm
      clientName={client?.name || clientId}
      oauthQuery={oauthQuery.toString()}
      scopes={scopes}
      userEmail={user.email}
      workspaces={workspaces}
    />
  )
}
