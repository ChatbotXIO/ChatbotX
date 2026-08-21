import { redirect } from "next/navigation"

// The standalone Ads section moved under Analytics (/dashboard/ads). These
// redirect stubs keep old deep links and bookmarks working.
export default async function AdsPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await props.params
  redirect(`/space/${workspaceId}/dashboard/ads`)
}
