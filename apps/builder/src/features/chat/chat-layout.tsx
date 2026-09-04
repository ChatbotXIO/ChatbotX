"use client"

import type { ConversationAttributes } from "@chatbotx.io/database/partials"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@chatbotx.io/ui/components/ui/resizable"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@chatbotx.io/ui/components/ui/sheet"
import { useIsMobileState } from "@chatbotx.io/ui/hooks/use-mobile"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useConversationIdParam } from "../conversations/hooks/use-conversation-id-param"
import type { ConversationResource } from "../conversations/schema/resource"
import {
  ContactDetailPane,
  ConversationListPane,
  MessageThreadPane,
  type PaneState,
} from "./chat-panes"
import { ChatRealtime } from "./chat-realtime"
import { useChatStore } from "./store/chat-store-provider"

type ChatLayoutProps = {
  canViewEmailAndPhone?: boolean
  workspaceId: string
  layout?: [number, number, number]
}

export const ChatLayout = (props: ChatLayoutProps) => {
  const t = useTranslations()
  const {
    canViewEmailAndPhone = true,
    workspaceId,
    layout = [25, 50, 25],
  } = props

  const {
    conversations,
    isFirstLoadConversation,
    isLoadingConversation,
    isBootstrappingUrlConversation,
    activeConversationId,
    setActiveConversationId,
  } = useChatStore((state) => state)

  const [activeConversation, setActiveConversation] =
    useState<ConversationResource | null>(null)
  const [isContactSheetOpen, setIsContactSheetOpen] = useState(false)
  const conversationIdParam = useConversationIdParam()

  // The inbox mounts three heavy, self-fetching panes. Choosing the layout in
  // CSS would mount all of them in both arrangements, so the choice is made in
  // JS — and rendering waits for the first measurement rather than guessing
  // desktop and remounting everything a frame later.
  const isMobile = useIsMobileState()

  const isResolvingConversation =
    (isFirstLoadConversation && isLoadingConversation) ||
    isBootstrappingUrlConversation
  const shouldShowEmptyState = !(
    activeConversation ||
    isFirstLoadConversation ||
    isBootstrappingUrlConversation
  )

  useEffect(() => {
    const selectedConversation = conversations.find(
      (c) => c.id === activeConversationId,
    )
    if (selectedConversation) {
      setActiveConversation({
        ...selectedConversation,
        additionalAttributes:
          selectedConversation.additionalAttributes as ConversationAttributes,
      })
    } else {
      setActiveConversation(null)
    }
    // Closes the mobile contact sheet left over from a previous conversation:
    // without this, going back and selecting a different thread could reopen
    // it bound to the wrong contact.
    setIsContactSheetOpen(false)
  }, [activeConversationId, conversations])

  const paneState: PaneState = {
    activeConversation,
    isResolvingConversation,
    shouldShowEmptyState,
  }

  return (
    <>
      {/*
        Kept outside the panes: on mobile the message pane unmounts whenever the
        user goes back to the list, and the realtime socket must not go with it.
      */}
      <ChatRealtime />
      {isMobile === undefined && (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Loader2Icon className="animate-spin" />
        </div>
      )}
      {isMobile === true && (
        // Fills the height `FullBleed` derives from the shell rather than
        // naming a viewport unit of its own — see the desktop group below.
        <div className="flex min-h-0 flex-1 flex-col">
          {activeConversationId ? (
            <MessageThreadPane
              {...paneState}
              onBack={() => {
                conversationIdParam.clear()
                setActiveConversationId(null)
              }}
              onOpenContact={() => setIsContactSheetOpen(true)}
              workspaceId={workspaceId}
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <ConversationListPane
                autoSelectFirstConversation={false}
                canViewEmailAndPhone={canViewEmailAndPhone}
                workspaceId={workspaceId}
              />
            </div>
          )}

          <Sheet onOpenChange={setIsContactSheetOpen} open={isContactSheetOpen}>
            <SheetContent
              className="w-[85vw] overflow-y-auto px-4 py-3 sm:max-w-sm"
              side="right"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>{t("fields.contact.label")}</SheetTitle>
                <SheetDescription>
                  {t("messages.selectConversationContactDescription")}
                </SheetDescription>
              </SheetHeader>
              <ContactDetailPane {...paneState} workspaceId={workspaceId} />
            </SheetContent>
          </Sheet>
        </div>
      )}
      {isMobile === false && (
        // Height comes from `flex-1`, never a `height` class: `PanelGroup`
        // hard-codes an inline `height: 100%`, which beats any stylesheet rule,
        // so `h-[100dvh]`/`h-full` here are silently dead and the group
        // collapses to its panes' content height — a short inbox with dead
        // space under it on a tall viewport.
        <ResizablePanelGroup className="min-h-0 flex-1 items-stretch">
          {/* CONVERSATION LIST */}
          <ResizablePanel
            className="p-3"
            defaultSize={`${layout[0] ?? 25}%`}
            maxSize={"30%"}
            minSize={"20%"}
          >
            <ConversationListPane
              canViewEmailAndPhone={canViewEmailAndPhone}
              workspaceId={workspaceId}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* MESSAGE LIST */}
          <ResizablePanel className="pt-3" defaultSize={`${layout[1] ?? 50}%`}>
            <MessageThreadPane {...paneState} workspaceId={workspaceId} />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* CONTACT DETAIL */}
          <ResizablePanel
            className="overflow-y-auto! h-full min-h-0 px-4 py-3"
            defaultSize={`${layout[2] ?? 25}%`}
            maxSize={"30%"}
            minSize={"20%"}
          >
            <ContactDetailPane {...paneState} workspaceId={workspaceId} />
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </>
  )
}
