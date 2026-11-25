import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound, redirect } from "next/navigation"
import { buildConnectTabRedirect } from "@/features/social-accounts/lib/connect-route"

/** The tab used to be called Accounts: old links and bookmarks land on Connect. */
export default async function SocialAccountsRedirectPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  return redirect(
    buildConnectTabRedirect(workspaceId, await props.searchParams),
  )
}
