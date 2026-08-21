import { redirect } from "next/navigation"

// The Automation tab merged into the Settings tab.
export default async function WhatsappAutomationRedirect(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { workspaceId, id } = await props.params
  redirect(`/space/${workspaceId}/whatsapps/${id}/settings`)
}
