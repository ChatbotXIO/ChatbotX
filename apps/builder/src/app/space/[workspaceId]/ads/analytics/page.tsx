import { redirect } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { buildRedirectSearch } from "@/lib/build-redirect-search"

// Moved to /dashboard/ads — preserve filters (account, date range) on redirect.
export default async function AdsAnalyticsRedirect(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { workspaceId } = await props.params
  const search = buildRedirectSearch(await props.searchParams)
  redirect(`/space/${workspaceId}/dashboard/ads${search}`)
}
