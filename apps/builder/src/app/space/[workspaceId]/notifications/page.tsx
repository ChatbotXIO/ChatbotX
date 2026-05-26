import { redirect } from "next/navigation"

export default async function NotificationsRedirect({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  redirect(`/space/${workspaceId}/account/notifications`)
}
