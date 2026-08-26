import { notFound, redirect } from "next/navigation"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

/**
 * The standalone "Ads" tab moved into a titled box (CTWA) inside the
 * existing "Ads Optimization" tab — see `whatsapp-capi-tab.tsx` and
 * out/plan/ctwa-ctm-ctid-box-merge.md Phase 5. Kept as a redirect (not
 * deleted) so old bookmarks/links to `.../ads` keep working.
 */
export default async function WhatsappAdsPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }
  return redirect(`/space/${data.workspaceId}/whatsapps/${data.id}/capi`)
}
