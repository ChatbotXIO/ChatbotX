import { ChatLayout } from "@/features/chat/chat-layout"
import { cookies } from "next/headers"

export default async function InboxPage() {
  const layout = (await cookies()).get("ahachatai:layout:inbox")
  const savedLayout = layout ? JSON.parse(layout.value) : [25, 50, 25]

  return <ChatLayout layout={savedLayout} />
}
