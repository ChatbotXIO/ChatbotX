import { redirect } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { buildRedirectSearch } from "@/lib/build-redirect-search"

// Moved to /dashboard/ads/conversion-events (kept hidden from navigation).
export default async function ConversionEventsRedirect(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { workspaceId } = await props.params
  const search = buildRedirectSearch(await props.searchParams)
  redirect(`/space/${workspaceId}/dashboard/ads/conversion-events${search}`)
}
