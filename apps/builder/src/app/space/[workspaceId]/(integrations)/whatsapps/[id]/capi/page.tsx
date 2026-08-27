import { notFound, redirect } from "next/navigation"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

/**
 * The tab route moved from `/capi` to `/ads` — it is no longer CAPI-only,
 * it also hosts the messaging-ads box and ads optimization. Kept as a
 * redirect (not deleted) so old bookmarks/links to `.../capi` keep working.
 */
export default async function WhatsappCapiRedirect(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }
  return redirect(`/space/${data.workspaceId}/whatsapps/${data.id}/ads`)
}
