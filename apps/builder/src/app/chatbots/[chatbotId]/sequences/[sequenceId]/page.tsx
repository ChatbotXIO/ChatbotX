import { parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { getSequence } from "@/features/sequences/queries"
import { SequenceEditor } from "@/features/sequences/sequence-editor"

export default async function SequenceDetailPage(props: {
  params: Promise<{ chatbotId: string; sequenceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId: chatbotIdString, sequenceId: sequenceIdString } =
    await props.params
  const chatbotId = parseBigIntId(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }
  const sequenceId = parseBigIntId(sequenceIdString)
  if (!sequenceId) {
    return notFound()
  }

  const sequence = await getSequence(chatbotId, sequenceId)

  return (
    <Suspense>
      <SequenceEditor chatbotId={chatbotId} sequence={sequence} />
    </Suspense>
  )
}
