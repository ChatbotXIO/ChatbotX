import { CreateBroadcastForm } from "@/features/broadcasts/create-broadcast-form"

export default async function CreateBroadcastPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params

  return <CreateBroadcastForm chatbotId={chatbotId} />
}
