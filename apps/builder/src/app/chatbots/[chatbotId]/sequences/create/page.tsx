import { getIdFromParams, parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { CreateSequenceForm } from "@/features/sequences/create-sequence-form"

export default async function CreateSequencePage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<{ folderId: string | null }>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }
  const searchParams = await props.searchParams
  const folderId = parseBigIntId(searchParams.folderId)

  return <CreateSequenceForm chatbotId={chatbotId} defaultFolderId={folderId} />
}
