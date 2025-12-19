import { CreateAutomatedResponseForm } from "@/features/automated-response/create-automated-response-form"

export default async function CreateAutomatedResponePage({
  params,
  searchParams,
}: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<{ folderId: string | null }>
}) {
  const { chatbotId } = await params
  const { folderId } = await searchParams

  return (
    <CreateAutomatedResponseForm
      chatbotId={chatbotId}
      folderId={folderId ?? null}
    />
  )
}
