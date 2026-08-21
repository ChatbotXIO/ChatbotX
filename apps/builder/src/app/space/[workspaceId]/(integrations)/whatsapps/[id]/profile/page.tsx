import { redirect } from "next/navigation"

// The Profile tab merged into the Settings tab.
export default async function WhatsappProfileRedirect(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { workspaceId, id } = await props.params
  redirect(`/space/${workspaceId}/whatsapps/${id}/settings`)
}
