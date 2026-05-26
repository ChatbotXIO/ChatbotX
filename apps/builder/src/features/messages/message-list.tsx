"use client"

import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { useEffect, useState } from "react"
import { type GridComponents, Virtuoso } from "react-virtuoso"
import { useWorkspaceId } from "@/hooks/routing"
import { useChatStore } from "../chat/store/chat-store-provider"
import { MessageItem } from "./components/message-item"

const MESSAGE_LIST_PER_PAGE = 50

export function MessageList() {
  const workspaceId = useWorkspaceId()

  const {
    messages,
    loadMoreMessages,
    nextCursorMessage,
    isLoadMoreMessage,
    activeConversationId,
  } = useChatStore((state) => state)

  // Check if there are more pages to load
  const hasNextPage = messages.length === 0 || nextCursorMessage !== null

  const [page, setPage] = useState(1)
  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
  useEffect(() => {
    setPage(1)
    if (activeConversationId) {
      loadMoreMessages(workspaceId, MESSAGE_LIST_PER_PAGE)
    }
  }, [activeConversationId])

  // Load more items when reaching the end of the list
  const loadMoreItems = () => {
    if (!isLoadMoreMessage && hasNextPage) {
      setPage((prev) => prev + 1)
    }
  }

  return (
    // FASE A/B revisão 2026-05-25 (Pedro feedback):
    // - alignToBottom REMOVIDO → mensagens começam DO TOPO do canvas
    //   (antes ficavam grudadas no rodapé deixando espaço em branco
    //   acima quando havia poucas msgs).
    // - followOutput mantido pra rolar pro fim quando chega msg nova.
    // - initialTopMostItemIndex LAST → ao ENTRAR na conversa, scroll já
    //   posiciona na última mensagem (igual WhatsApp/Respond.io).
    <div className="flex flex-1 flex-col">
      <Virtuoso
        components={{
          List: MessageComponentList,
          Header: MessageComponentHeader,
        }}
        data={messages}
        followOutput
        initialTopMostItemIndex={{ index: "LAST" }}
        itemContent={(index, message) => (
          <MessageItem
            key={message.id}
            message={message}
            nextMessage={
              index < messages.length - 1 ? messages[index + 1] : undefined
            }
            prevMessage={index > 0 ? messages[index - 1] : undefined}
          />
        )}
        rangeChanged={({ startIndex }) => {
          if (startIndex <= 5 && page !== 1) {
            loadMoreItems()
          }
        }}
      />
    </div>
  )
}

const MessageComponentHeader: GridComponents["Header"] = () => {
  const { isLoadMoreMessage } = useChatStore((state) => state)

  return isLoadMoreMessage ? (
    <div className="flex items-center space-x-2 px-3 py-2">
      <Skeleton className="h-8 w-3/5 rounded-xl" />
    </div>
  ) : null
}

// Padding lateral horizontal pra que avatar+bubble não fiquem colados
// nas bordas do canvas. Pedro pegou 2026-05-25 iteração 7: tinha px-4
// (16px) mas Respond.io ao vivo usa exatamente 12px (`dls-px-3` no
// container .dls-flex-row.dls-items-end da linha de mensagem). Confirmado
// via Chrome MCP getComputedStyle: padding "0px 12px 6px 12px".
// gap-1.5 entre mensagens.
const MessageComponentList: GridComponents["List"] = ({
  children,
  ...props
}) => (
  <div
    {...props}
    className="virtuoso-item-list flex flex-col gap-1.5 px-3 [&>div:first-child]:mt-3"
  >
    {children}
  </div>
)
