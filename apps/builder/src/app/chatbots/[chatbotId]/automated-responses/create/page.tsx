import { getIdFromParams, parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { CreateAutomatedResponseForm } from "@/features/automated-response/create-automated-response-form"

export default async function CreateAutomatedResponePage({
  params,
  searchParams,
}: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<{ folderId: string | null }>
}) {
  const chatbotId = getIdFromParams(await params, "chatbotId")
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
