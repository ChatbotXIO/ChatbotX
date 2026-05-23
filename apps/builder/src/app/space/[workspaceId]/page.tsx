import { redirect } from "next/navigation"

type WorkspacePageProps = {
  params: Promise<{ workspaceId: string }>
}

export default async function WorkspacePage(props: WorkspacePageProps) {
  const { workspaceId } = await props.params

  return redirect(`/space/${workspaceId}/dashboard`)
}
