import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { listSnippetsRSC } from "@/features/saved-replies/queries/list-snippets-rsc"
import { SnippetsTable } from "@/features/saved-replies/snippets-table"

export default async function SnippetsPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const promises = Promise.all([listSnippetsRSC({ workspaceId })])

  return (
    <Suspense>
      <SnippetsTable promises={promises} workspaceId={workspaceId} />
    </Suspense>
  )
}
