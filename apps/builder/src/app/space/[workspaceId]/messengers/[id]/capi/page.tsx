import { notFound, redirect } from "next/navigation"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

/**
 * The tab route moved from `/capi` to `/ads` — it hosts CAPI / ads
 * optimization; the messaging-ads box moved to the standalone Click to
 * Message Ads tool. Kept as a redirect (not deleted) so old bookmarks/links
 * to `.../capi` keep working.
 */
export default async function MessengerCapiRedirect(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }
  return redirect(`/space/${data.workspaceId}/messengers/${data.id}/ads`)
}
