import { InboxDetail } from "@/features/inbox/inbox-detail"
import { cookies } from "next/headers"

export default async function InboxPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const layout = (await cookies()).get("ahachatai:layout:inbox")
  const savedLayout = layout ? JSON.parse(layout.value) : [25, 50, 25]
  const chatbotId = (await params).chatbotId

  return <InboxDetail chatbotId={chatbotId} layout={savedLayout} />
}
