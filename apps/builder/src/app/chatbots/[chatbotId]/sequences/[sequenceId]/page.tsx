import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { getSequence } from "@/features/sequences/queries"
import { SequenceEditor } from "@/features/sequences/sequence-editor"

export default async function SequenceDetailPage(props: {
  params: Promise<{ chatbotId: string; sequenceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId, sequenceId } = await props.params

  const sequence = await getSequence(chatbotId, sequenceId)

  return (
    <Suspense>
      <SequenceEditor chatbotId={chatbotId} sequence={sequence} />
    </Suspense>
  )
}
