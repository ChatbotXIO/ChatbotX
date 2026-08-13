import { redirect } from "next/navigation"

export default async function AdsPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await props.params
  redirect(`/space/${workspaceId}/ads/connect-accounts`)
}
