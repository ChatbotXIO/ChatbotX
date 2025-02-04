import { cookies } from "next/headers"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import type { ReactNode } from "react"

interface InboxLayoutProps {
  listConversations: ReactNode
  listMessages: ReactNode
  contact: ReactNode
}

export default async function InboxLayout({
  listConversations,
  listMessages,
  contact,
}: InboxLayoutProps) {
  const layout = (await cookies()).get("ahachatai:layout:inbox")
  const defaultLayout = layout ? JSON.parse(layout.value) : [25, 50, 25]

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="h-full max-h-[calc(100vh-48px)] items-stretch"
    >
      {/* CONVERSATION LIST */}
      <ResizablePanel
        defaultSize={defaultLayout[0] ?? 25}
        minSize={20}
        maxSize={25}
        className="p-3"
      >
        {listConversations}
      </ResizablePanel>
      <ResizableHandle withHandle />

      {/* MESSAGE LIST */}
      <ResizablePanel
        defaultSize={defaultLayout[1] ?? 50}
        minSize={40}
        className="py-3"
      >
        {listMessages}
      </ResizablePanel>
      <ResizableHandle withHandle />

      {/* CONTACT DETAIL */}
      <ResizablePanel
        defaultSize={defaultLayout[2] ?? 25}
        minSize={20}
        maxSize={25}
        className="p-3"
      >
        {contact}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
