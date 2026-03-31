import { parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { CreateAutomatedResponseForm } from "@/features/automated-response/create-automated-response-form"

export default async function CreateAutomatedResponePage({
  params,
  searchParams,
}: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<{ folderId: string | null }>
}) {
  const { chatbotId: chatbotIdString } = await params
  const chatbotId = parseBigIntId(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }

  const { folderId } = await searchParams

  return (
    <CreateAutomatedResponseForm
      chatbotId={chatbotId}
      folderId={folderId ? parseBigIntId(folderId) : undefined}
    />
  )
}
