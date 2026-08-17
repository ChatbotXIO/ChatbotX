import { redirect } from "next/navigation"

export default async function Dashboard(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await props.params
  redirect(`/space/${workspaceId}/dashboard/contacts`)
}
