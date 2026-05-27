"use client"

import type {
  ClosingNotesMode,
  ConversationAttributes,
} from "@chatbotx.io/database/partials"
import type { LifecycleStageModel } from "@chatbotx.io/database/types"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@chatbotx.io/ui/components/ui/resizable"
import { Loader2Icon, MessagesSquareIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import type { ClosingNoteCategoryOption } from "@/features/closing-notes/queries/get-config"
import { ContactInboxPanel } from "../contacts/contact-inbox-panel"
import ConversationList from "../conversations/conversation-list"
import type { ConversationResource } from "../conversations/schema/resource"
import { MessageInput } from "../messages/components/message-input"
import MessageHead from "../messages/message-head"
import { MessageList } from "../messages/message-list"
import { ChatRealtime } from "./chat-realtime"
import { InboxSideRail } from "./inbox-side-rail"
import { useChatStore } from "./store/chat-store-provider"

type ChatLayoutProps = {
  workspaceId: string
  layout?: [number, number, number]
  lifecycleStages?: LifecycleStageModel[]
  /** Lista de `fieldKey`s marcadas como `alwaysHide` no workspace. */
  hiddenFieldKeys?: string[]
  /** Modo de Closing Notes do workspace (default "disabled"). */
  closingNotesMode?: ClosingNotesMode
  /** Categorias de fechamento disponíveis pro Inbox. */
  closingNoteCategories?: ClosingNoteCategoryOption[]
}

export const ChatLayout = (props: ChatLayoutProps) => {
  const t = useTranslations()
  const {
    workspaceId,
    layout = [25, 50, 25],
    lifecycleStages = [],
    hiddenFieldKeys = [],
    closingNotesMode = "disabled",
    closingNoteCategories = [],
  } = props

  const {
    conversations,
    isFirstLoadConversation,
    isLoadingConversation,
    activeConversationId,
  } = useChatStore((state) => state)

  const [activeConversation, setActiveConversation] =
    useState<ConversationResource | null>(null)

  // Pedro iter 40: drawer (Detalhes do contato) abre por default.
  // Toggle via sideRail (botão único). Persistido em localStorage pra
  // próxima sessão lembrar do estado.
  const [drawerOpen, setDrawerOpen] = useState<boolean>(true)
  useEffect(() => {
    const saved =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem("chatbotx.inbox.drawer.open")
    if (saved !== null) {
      setDrawerOpen(saved === "1")
    }
  }, [])
  const toggleDrawer = () => {
    setDrawerOpen((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(
          "chatbotx.inbox.drawer.open",
          next ? "1" : "0",
        )
      } catch {
        // ignore
      }
      return next
    })
  }

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
  }, [activeConversationId, conversations])

  // Pedro 2026-05-25 iteração 34 (pixel-perfect Respond.io):
  // O TOPBAR (MessageHead) deve cobrir tanto a coluna de mensagens
  // QUANTO o drawer de detalhes — ficar full-width na parte direita.
  // Antes ficava só dentro do panel de msgs; agora a estrutura é:
  //
  //   [Lista convs] | (MessageHead + [msgs | drawer+sideRail])
  //
  // Dois ResizablePanelGroups aninhados pra resize independente entre:
  //   1. (lista convs)  vs  (área direita: header+msgs+drawer)
  //   2. (coluna msgs)  vs  (coluna drawer+sideRail)
  //
  // Layout cookie original era [convs, msgs, drawer]. Convertemos:
  //   - externo: [convs%, 100-convs%]
  //   - interno: [msgs / (msgs+drawer), drawer / (msgs+drawer)] %
  const convsSize = layout[0] ?? 24
  const rightSize = 100 - convsSize
  const inner = (layout[1] ?? 63) + (layout[2] ?? 13)
  const innerMsgsSize = Math.round(((layout[1] ?? 63) / inner) * 100)
  const innerDrawerSize = 100 - innerMsgsSize

  return (
    <ResizablePanelGroup className="h-full items-stretch">
      {/* CONVERSATION LIST — full-height (não é coberto pelo topbar). */}
      <ResizablePanel
        defaultSize={`${convsSize}%`}
        maxSize={"30%"}
        minSize={"15%"}
      >
        <ConversationList
          lifecycleStages={lifecycleStages}
          workspaceId={workspaceId}
        />
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* ÁREA DIREITA — Pedro iter 40:
          TOPBAR cobre TUDO (msgs + drawer + sideRail). Antes o
          sideRail ficava SOBRE o topbar (errado). Agora o topbar é
          full-width e o sideRail vive na linha de baixo.

          Estrutura:
            flex column [
              MessageHead (topbar full-width),
              flex row [
                ResizablePanelGroup [msgs, drawer? (toggle)],
                InboxSideRail (45px botão único)
              ]
            ]
      */}
      <ResizablePanel defaultSize={`${rightSize}%`}>
        {activeConversation ? (
          <div className="flex h-full w-full flex-col">
            {/* TOPBAR full-width — cobre msgs + drawer + sideRail */}
            <MessageHead
              closingNoteCategories={closingNoteCategories}
              closingNotesMode={closingNotesMode}
              lifecycleStages={lifecycleStages}
            />

            {/* LINHA DE BAIXO: msgs | drawer | sideRail */}
            <div className="flex min-h-0 flex-1">
              <ResizablePanelGroup className="items-stretch">
                <ResizablePanel defaultSize={drawerOpen ? innerMsgsSize : 100}>
                  <div className="flex h-full w-full flex-col">
                    <MessageList />
                    <MessageInput />
                  </div>
                </ResizablePanel>

                {drawerOpen && (
                  <>
                    <ResizableHandle withHandle />
                    <ResizablePanel
                      className="overflow-hidden!"
                      defaultSize={innerDrawerSize}
                      maxSize={"30%"}
                      minSize={"14%"}
                    >
                      <div className="flex h-full w-full bg-app-surface">
                        <div className="flex h-full min-h-0 flex-1 flex-col px-4 py-3">
                          <ContactInboxPanel
                            activeConversationId={activeConversation.id}
                            hiddenFieldKeys={hiddenFieldKeys}
                            lifecycleStages={lifecycleStages}
                            workspaceId={workspaceId}
                          />
                        </div>
                      </div>
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>

              {/* SIDERAIL — 45px à direita, ABAIXO do topbar (iter 40).
                  Botão único toggle do drawer. */}
              <InboxSideRail
                drawerOpen={drawerOpen}
                onToggleDrawer={toggleDrawer}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full">
            {isFirstLoadConversation && isLoadingConversation && (
              <Loader2Icon className="mx-auto my-4 animate-spin" />
            )}
            {!(activeConversation || isFirstLoadConversation) && (
              <div
                aria-live="polite"
                className="flex h-full w-full flex-col items-center justify-center px-6 text-center"
              >
                <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
                  <MessagesSquareIcon
                    aria-hidden="true"
                    className="size-7 text-muted-foreground"
                  />
                </div>
                <h3 className="font-semibold text-base">
                  {t("messages.selectConversationTitle")}
                </h3>
                <p className="mt-1 max-w-sm text-muted-foreground text-sm">
                  {t("messages.selectConversationDescription")}
                </p>
              </div>
            )}
          </div>
        )}
        <ChatRealtime />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
