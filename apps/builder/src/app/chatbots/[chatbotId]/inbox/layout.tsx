import * as React from "react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import { TooltipProvider } from "@/components/ui/tooltip";

interface InboxLayoutProps {
  conversation: React.ReactNode;
  message: React.ReactNode;
  contact: React.ReactNode;
}

export default function InboxLayout({
  conversation,
  message,
  contact,
}: InboxLayoutProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        direction="horizontal"
        className="h-full max-h-[calc(100vh-64px)] items-stretch"
      >
        <ResizablePanel defaultSize={20} minSize={20} maxSize={25}>
          {conversation}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={48} minSize={30}>
          {message}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={20} minSize={15} maxSize={25}>
          {contact}
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  );
}
