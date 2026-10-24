import { redirect } from "next/navigation"

export default async function EcommerceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  redirect(`/space/${workspaceId}/ecommerce-settings/general`)
}
