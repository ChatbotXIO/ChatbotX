import * as React from "react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

import { TooltipProvider } from "@/components/ui/tooltip"

interface InboxLayoutProps {
  customer: React.ReactNode
  conversation: React.ReactNode,
  details: React.ReactNode,
}

export default function InboxLayout({ customer, conversation, details }: InboxLayoutProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        direction="horizontal"
        className="h-full max-h-[calc(100vh-28px)] items-stretch"
      >
        <ResizablePanel defaultSize={32} minSize={30}>
          {customer}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={48} minSize={30}>
          { conversation }
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={32} minSize={20}>
          { details }
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  )
}
