import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { getSequence } from "@/features/sequences/queries"
import { SequenceEditor } from "@/features/sequences/sequence-editor"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function SequenceDetailPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
  searchParams: Promise<SearchParams>
}) {
  const { data } = await withWorkspaceIdAndIdSchema.safeParse(
    await props.params,
  )
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  const sequence = await getSequence(workspaceId, id)

  return (
    <Suspense>
      <SequenceEditor sequence={sequence} workspaceId={workspaceId} />
    </Suspense>
  )
}
