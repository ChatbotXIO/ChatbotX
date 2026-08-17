import { redirect } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { buildRedirectSearch } from "@/lib/build-redirect-search"

// Connect Accounts was split up: the WhatsApp "Automatic Events" table moved
// into each WhatsApp channel's Ads Optimization tab, and the Facebook ad
// accounts section moved to Analytics > Ads (/dashboard/ads). Forward the
// query string so `?account=…` keeps selecting the same WhatsApp account.
export default async function ConnectAccountsRedirect(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { workspaceId } = await props.params
  const search = buildRedirectSearch(await props.searchParams)
  redirect(`/space/${workspaceId}/dashboard/ads${search}`)
}
