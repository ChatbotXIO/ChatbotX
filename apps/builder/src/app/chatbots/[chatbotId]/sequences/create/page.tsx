import type { SearchParams } from "nuqs/server"
import { CreateSequenceForm } from "@/features/sequences/create-sequence-form"

export default async function CreateSequencePage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId } = await props.params
  const searchParams = await props.searchParams
  const folderId = searchParams.folderId as string | undefined

  return <CreateSequenceForm chatbotId={chatbotId} defaultFolderId={folderId} />
}
