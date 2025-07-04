import { CreateBroadcastForm } from "@/features/broadcasts/create-broadcast-form"
import { listInboxes } from "@/features/inboxes/queries"

export default async function CreateBroadcastPage({
  params,
}: { params: Promise<{ chatbotId: string }> }) {
  const { chatbotId } = await params
  const inboxesPromise = listInboxes({ chatbotId, perPage: 9999 })

  return <CreateBroadcastForm chatbotId={chatbotId} promises={inboxesPromise} />
}
