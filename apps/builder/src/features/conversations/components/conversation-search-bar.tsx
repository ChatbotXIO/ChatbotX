"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useRef, useState } from "react"
import { RespondIcon } from "@/components/respond-icon"
import { searchMessagesInConversationAction } from "@/features/messages/actions/search-messages-in-conversation.action"
import type { MessageResourceWithRelations } from "@/features/messages/schema/resource"
import { useWorkspaceId } from "@/hooks/routing"

type ConversationSearchBarProps = {
  conversationId: string
  // Notifica o resultado ativo pro pai (ex: pra scrollar até a mensagem na
  // lista). Por enquanto MessageList ainda não consome — fica preparado.
  onActiveResultChange?: (message: MessageResourceWithRelations | null) => void
}

// Barra de busca dentro da conversa atual (Sprint Inbox 1.2). Estilo
// Respond.io: aparece abaixo do header quando a lupa é clicada. Digita
// keyword (debounce 350ms), mostra contagem de resultados e setas ↑↓ pra
// navegar. ESC fecha a barra. Click no resultado destaca a mensagem (futuro:
// scroll-to-message via Virtuoso index).
export function ConversationSearchBar({
  conversationId,
  onActiveResultChange,
}: ConversationSearchBarProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  const [keyword, setKeyword] = useState("")
  const [results, setResults] = useState<MessageResourceWithRelations[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const { execute, isExecuting } = useAction(
    searchMessagesInConversationAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        const next = data?.results ?? []
        setResults(next)
        setActiveIndex(0)
        onActiveResultChange?.(next[0] ?? null)
      },
      onError: () => {
        setResults([])
        onActiveResultChange?.(null)
      },
    },
  )

  // Foca o input ao montar (barra acabou de abrir).
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Debounce de 350ms na keyword pra não disparar action a cada tecla.
  useEffect(() => {
    const trimmed = keyword.trim()
    if (!trimmed) {
      setResults([])
      onActiveResultChange?.(null)
      return
    }
    const handle = setTimeout(() => {
      execute({ conversationId, keyword: trimmed })
    }, 350)
    return () => clearTimeout(handle)
    // execute é estável (next-safe-action); onActiveResultChange é opcional
  }, [keyword, conversationId, onActiveResultChange, execute])

  function navigate(delta: number) {
    if (results.length === 0) {
      return
    }
    const next = (activeIndex + delta + results.length) % results.length
    setActiveIndex(next)
    onActiveResultChange?.(results[next] ?? null)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      navigate(e.shiftKey ? -1 : 1)
    }
    if (e.key === "Escape") {
      setKeyword("")
    }
  }

  const hasKeyword = Boolean(keyword.trim())

  return (
    <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
      <RespondIcon
        className="shrink-0 text-muted-foreground"
        name="search-normal"
        size="md"
      />
      <Input
        className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0"
        onChange={(e) => setKeyword(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("conversations.searchInConversationPlaceholder")}
        ref={inputRef}
        value={keyword}
      />
      {isExecuting && (
        <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
      )}
      {hasKeyword && !isExecuting && (
        <span
          className={cn(
            "shrink-0 text-xs",
            results.length === 0 ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {results.length === 0
            ? t("conversations.searchNoResults")
            : `${activeIndex + 1}/${results.length}`}
        </span>
      )}
      <Button
        aria-label={t("conversations.searchPrevious")}
        className="size-7 shrink-0"
        disabled={results.length === 0}
        onClick={() => navigate(-1)}
        size="icon"
        variant="ghost"
      >
        <RespondIcon name="arrow-up-1" size="md" />
      </Button>
      <Button
        aria-label={t("conversations.searchNext")}
        className="size-7 shrink-0"
        disabled={results.length === 0}
        onClick={() => navigate(1)}
        size="icon"
        variant="ghost"
      >
        <RespondIcon name="arrow-down-1" size="md" />
      </Button>
      <Button
        aria-label={t("actions.close")}
        className="size-7 shrink-0"
        onClick={() => setKeyword("")}
        size="icon"
        variant="ghost"
      >
        <RespondIcon name="close-circle" size="md" />
      </Button>
    </div>
  )
}
