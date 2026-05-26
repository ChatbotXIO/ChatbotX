"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { createId } from "@chatbotx.io/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslations } from "next-intl"
import {
  type KeyboardEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react"
import { Controller, useWatch } from "react-hook-form"
import { RespondIcon } from "@/components/respond-icon"
import {
  getAvatarInitials,
  getRespondAvatarUrl,
} from "@/features/contacts/utils"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { QuickRepliesPopover } from "@/features/saved-replies/quick-replies-popover"
import SavedReplyManage from "@/features/saved-replies/saved-reply-manage"
import { authClient } from "@/lib/auth/auth-client"
import { useChatStore } from "../../chat/store/chat-store-provider"
import { createMessageAction } from "../actions/create-message.action"
import { createMessageRequest } from "../schema/mutation"
import EmojiPicker from "./emoji-picker"
import { FileUploadPreview } from "./file-upload"
import { type MentionItem, MentionPopover } from "./mention-popover"

// Pixel-perfect Respond.io 2026-05-25 (SEÇÃO #4 iteração 13 — Pedro):
// Composer principal SEMPRE visível. "Adicionar comentário" abre uma
// CAIXA SUSPENSA AMBER SEPARADA por baixo (não substitui o composer
// principal). Quando comment aberto, dá pra enviar tanto mensagem
// (composer principal acima) quanto comentário interno (caixa amber).
//
// Cores AMBER (Chrome MCP no Respond.io ao vivo):
// - bg: rgb(63, 51, 34) = #3F3322
// - border: rgb(255, 160, 36) = #FFA024 (1.33 px)
// - radius: 8 px
// - padding: 24 px (dls-p-6)
//
// Comportamento medido:
// - Main composer y=1019, h=112 (continua visível)
// - Comment box y=1140, h=91 (aparece abaixo, gap 9 px)
// - X close no canto direito da caixa fecha o painel
//
// Ícones do toolbar (esquerda → direita): emoji, attach, snippets.
// Microphone, AI prompts, AI Assist: mapeados no iconfont mas NÃO
// renderizados (sem feature real, e Pedro proibiu placeholders fake).
export const MessageInput = () => {
  const t = useTranslations()
  const session = authClient.useSession()

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null)
  const fileUploadRef = useRef<HTMLInputElement>(null)

  const { appendMessage, activeConversationId, conversations } = useChatStore(
    (state) => state,
  )

  const conversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  )

  const [showCommentBox, setShowCommentBox] = useState(false)
  const [commentText, setCommentText] = useState("")

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createMessageAction.bind(
        null,
        conversation?.workspaceId ?? "",
        conversation?.id ?? "",
      ),
      zodResolver(createMessageRequest),
      {
        actionProps: {
          onExecute: ({ input }: { input: unknown }) => {
            if (
              typeof input === "object" &&
              input !== null &&
              "text" in input &&
              input.text
            ) {
              const typedInput = input as {
                text: string
                clientId: string
                isInternal?: boolean
              }
              appendMessage({
                text: typedInput.text,
                id: createId(),
                createdAt: new Date(),
                updatedAt: new Date(),
                workspaceId: conversation?.workspaceId ?? "",
                sourceId: null,
                contactInboxId: "",
                conversationId: conversation?.id ?? "",
                contentAttributes: null,
                messageType: "outgoing",
                contentType: "text",
                senderType: "user",
                senderId: session?.data?.user.id ?? null,
                clientId: typedInput.clientId,
                isInternal: typedInput.isInternal ?? false,
              })
            }

            form.reset()
            textareaRef.current?.focus()
          },
          onSuccess: () => {
            textareaRef.current?.focus()
            resetFormAndAction()
            form.setValue("clientId", createId())
          },
        },
        formProps: {
          defaultValues: {
            text: "",
            files: [],
            clientId: createId(),
            isInternal: false,
          },
        },
        errorMapProps: {},
      },
    )

  const setContent = useCallback(
    (value: string, insert = false) => {
      const element = textareaRef.current
      if (!element) {
        return
      }

      if (!insert) {
        form.setValue("text", value, {
          shouldValidate: true,
        })
        return
      }

      const text = element.value
      const before = text.slice(0, element.selectionStart)
      const after = text.slice(element.selectionStart)

      form.setValue("text", `${before}${value}${after}`, {
        shouldValidate: true,
      })
    },
    [form],
  )

  const setCommentContent = useCallback((value: string, insert = false) => {
    const el = commentTextareaRef.current
    if (!el) {
      return
    }
    if (!insert) {
      setCommentText(value)
      return
    }
    const text = el.value
    const before = text.slice(0, el.selectionStart)
    const after = text.slice(el.selectionStart)
    setCommentText(`${before}${value}${after}`)
  }, [])

  // ─── @ MENTION (Pedro 2026-05-25 iteração 23) ────────────────────
  // Detecta quando user digita "@" no comment textarea e abre popover
  // com lista de workspace members. Algoritmo:
  // - A cada mudança do texto, olha caractere antes do cursor
  // - Procura último "@" sem espaço após ele (entre @ e cursor)
  // - Se achar, abre popover com query = texto entre @ e cursor
  // - Click em member: substitui "@query" por "@nome "
  const [mentionTriggerIndex, setMentionTriggerIndex] = useState<number | null>(
    null,
  )
  const [mentionQuery, setMentionQuery] = useState("")

  const detectMention = useCallback((text: string, caret: number) => {
    // Procurar último @ antes do cursor
    let i = caret - 1
    while (i >= 0) {
      const ch = text[i]
      if (ch === "@") {
        // Mention só vale se @ é início OU vem após espaço/quebra
        const prev = i > 0 ? text[i - 1] : " "
        if (prev === " " || prev === "\n" || i === 0) {
          const q = text.slice(i + 1, caret)
          // Query inválida se tem espaço dentro
          if (!(q.includes(" ") || q.includes("\n"))) {
            setMentionTriggerIndex(i)
            setMentionQuery(q)
            return
          }
        }
        break
      }
      if (ch === " " || ch === "\n") {
        break
      }
      i--
    }
    setMentionTriggerIndex(null)
    setMentionQuery("")
  }, [])

  const handleCommentTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      setCommentText(value)
      detectMention(value, e.target.selectionStart)
    },
    [detectMention],
  )

  const handleMentionSelect = useCallback(
    (item: MentionItem) => {
      const el = commentTextareaRef.current
      if (!el || mentionTriggerIndex === null) {
        return
      }
      const caret = el.selectionStart
      const before = commentText.slice(0, mentionTriggerIndex)
      const after = commentText.slice(caret)
      const inserted = `@${item.name} `
      const newText = `${before}${inserted}${after}`
      setCommentText(newText)
      setMentionTriggerIndex(null)
      setMentionQuery("")
      // Reposicionar cursor após @nome
      setTimeout(() => {
        const newCaret = before.length + inserted.length
        el.setSelectionRange(newCaret, newCaret)
        el.focus()
      }, 0)
    },
    [commentText, mentionTriggerIndex],
  )

  const closeMention = useCallback(() => {
    setMentionTriggerIndex(null)
    setMentionQuery("")
  }, [])

  const onClickAttachment = useCallback(() => {
    if (fileUploadRef.current) {
      // biome-ignore lint/suspicious/noExplicitAny: wip
      ;(fileUploadRef.current as any).openFileDialog()
    }
  }, [])

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.nativeEvent.isComposing || e.key === "Process") {
        return
      }
      if (e.key === "Enter" && e.shiftKey === false) {
        e.preventDefault()
        handleSubmitWithAction()
      }
    },
    [handleSubmitWithAction],
  )

  const submitComment = useCallback(() => {
    if (!(commentText.trim() && conversation)) {
      return
    }
    // Reuse mesma action — só com isInternal=true
    appendMessage({
      text: commentText,
      id: createId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      workspaceId: conversation.workspaceId ?? "",
      sourceId: null,
      contactInboxId: "",
      conversationId: conversation.id ?? "",
      contentAttributes: null,
      messageType: "outgoing",
      contentType: "text",
      senderType: "user",
      senderId: session?.data?.user.id ?? null,
      clientId: createId(),
      isInternal: true,
    })
    // Fire-and-forget pra backend
    createMessageAction
      .bind(
        null,
        conversation.workspaceId ?? "",
        conversation.id ?? "",
      )({
        text: commentText,
        files: [],
        clientId: createId(),
        isInternal: true,
      } as never)
      .catch(() => {
        /* erros visíveis via toast em outro fluxo — manter simples aqui */
      })
    setCommentText("")
    commentTextareaRef.current?.focus()
  }, [commentText, conversation, appendMessage, session])

  const onCommentKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.nativeEvent.isComposing || e.key === "Process") {
        return
      }
      if (e.key === "Enter" && e.shiftKey === false) {
        e.preventDefault()
        submitComment()
      }
    },
    [submitComment],
  )

  const isDisabled = false
  const placeholder = t("conversations.composerHint")

  // Avatar do user logado pra mostrar no canto esquerdo da caixa de
  // comentário interno (Pedro iteração 15 — Respond.io mostra ali).
  // Snowflake bigint pra string + helper visual padronizado.
  const sUser = session?.data?.user
  const currentUserName = sUser?.name ?? sUser?.email ?? ""
  const currentUserImage = sUser?.image ?? null
  // Iter 41: seed = user.id (consistente com message-item outgoing).
  const currentUserSeed = getRespondAvatarUrl(
    sUser?.id ?? currentUserName ?? "u",
  )
  const currentUserInitials = getAvatarInitials(currentUserName) || "?"

  const files = useWatch({
    control: form.control,
    name: "files",
  })
  const hasFiles = Array.isArray(files) && files.length > 0

  if (!activeConversationId) {
    return null
  }

  const activeChannel = conversation?.contactInboxes?.[0]?.channel ?? "webchat"
  const channelLabel =
    activeChannel === "whatsapp"
      ? "WhatsApp Business"
      : activeChannel.charAt(0).toUpperCase() + activeChannel.slice(1)
  const contactNumber = conversation?.contact?.phoneNumber ?? ""

  return (
    // Wrapper com PADDING LATERAL + TOP — fica afastado das bordas do
    // canvas (Pedro 2026-05-25 iterações 14+22): composer "suspenso"
    // dentro da conversation window. pt-3 dá respiro entre a última
    // mensagem e o composer (Pedro pegou na iteração 22 que estava
    // colado). Equivalente ao dls-pb-8 do chat-window-container Respond.io.
    <div className="flex flex-col px-3 pt-5 pb-3">
      {/* COMPOSER PRINCIPAL — sempre visível. Caixa destacada com bg-card,
          border + radius 8 px que dá sensação de "flutuante" sobre o
          canvas (#101113) do MessageList. */}
      <div className="rounded-[8px] border border-white/[0.08] bg-card">
        <div className="flex items-center justify-between px-3 pt-2 pb-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label={channelLabel}
                className="inline-flex h-7 items-center gap-1.5 rounded-[4px] border border-white/[0.12] bg-transparent px-2 text-[12px] text-text-secondary transition-colors hover:bg-white/[0.04]"
                type="button"
              >
                <InboxIcon
                  channel={activeChannel as ChannelType}
                  size="small"
                />
                <span className="font-medium">{channelLabel}</span>
                {contactNumber && (
                  <>
                    <span className="text-text-secondary/40">·</span>
                    <span className="text-text-secondary/80">
                      {t("conversations.channelPrefix")} {contactNumber}
                    </span>
                  </>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t("messages.composer.channelHint")}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* TEXTAREA + TOOLBAR — COLAPSAM com animação suave quando comment
            box abre (Pedro 2026-05-25 iteração 19). Antes era `hidden`
            (corte seco); agora usa grid-rows trick pra animar max-height
            + opacity em ~300 ms. O `overflow-hidden` no wrapper interno
            esconde conteúdo durante a animação sem deformar o textarea. */}
        <div
          className={cn(
            "grid transition-all duration-300 ease-out",
            showCommentBox
              ? "grid-rows-[0fr] opacity-0"
              : "grid-rows-[1fr] opacity-100",
          )}
        >
          <div className="overflow-hidden">
            <Form {...form}>
              <form
                aria-label={t("messages.composer.formLabel")}
                className="flex w-full flex-col"
                onSubmit={handleSubmitWithAction}
              >
                <div className="w-full px-3 pb-1">
                  <Controller
                    control={form.control}
                    name="text"
                    render={({ field }) => (
                      <QuickRepliesPopover
                        inputValue={field.value ?? ""}
                        onSelect={setContent}
                      >
                        <Textarea
                          aria-label={t("messages.composer.textareaLabel")}
                          autoComplete="off"
                          className="!bg-transparent dark:!bg-transparent min-h-16 resize-none border-0 px-0 py-1 text-[14px] text-foreground shadow-none focus:ring-0 focus-visible:ring-0"
                          disabled={isDisabled}
                          placeholder={placeholder}
                          {...field}
                          onKeyDown={onKeyDown}
                          ref={textareaRef}
                        />
                      </QuickRepliesPopover>
                    )}
                  />
                </div>

                {hasFiles && (
                  <div className="px-3 pb-1">
                    <FileUploadPreview ref={fileUploadRef} />
                  </div>
                )}
                {!hasFiles && <FileUploadPreview ref={fileUploadRef} />}

                <div className="flex items-center justify-between px-2 pb-2">
                  <div className="flex items-center gap-0.5">
                    <EmojiPicker onSelectEmoji={(e) => setContent(e, true)} />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={t("messages.composer.attach")}
                          className="size-8 rounded-md text-text-secondary hover:bg-white/[0.06] hover:text-foreground"
                          onClick={onClickAttachment}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <RespondIcon name="attach-square" size="lg" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {t("messages.composer.attach")}
                      </TooltipContent>
                    </Tooltip>
                    <SavedReplyManage onSelect={setContent} />
                  </div>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label={t("messages.composer.send")}
                        className="size-9 rounded-md bg-primary text-white hover:bg-primary/90 disabled:bg-primary/40 disabled:text-white/60"
                        disabled={
                          !form.formState.isValid || form.formState.isSubmitting
                        }
                        size="icon"
                        type="submit"
                      >
                        <RespondIcon name="send-bold" size="lg" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {t("messages.composer.send")}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </div>

      {/* CAIXA AMBER SUSPENSA — comentário interno (suspensa abaixo do composer
          principal, separada por gap). Pixel-perfect Respond.io 2026-05-25:
          - bg: #3F3322 (rgb 63 51 34)
          - border: #FFA024 (rgb 255 160 36) 1.33 px ≈ border-[1px]
          - radius: 8 px
          - padding: 24 px (dls-p-6)
          Composer principal continua visível em cima — pode enviar mensagem
          OU comentário, é escolha do agente.
          O wrapper externo já tem px-3 pb-3, então uso só mt-2 aqui. */}
      {showCommentBox ? (
        // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label em region implícita do composer comment — landmark visual
        <div
          aria-label={t("messages.composer.internalLabel")}
          className="fade-in slide-in-from-top-2 relative mt-2 animate-in rounded-[8px] border border-[#FFA024] bg-[#3F3322] px-3 pt-3 pb-2 duration-300 ease-out"
        >
          {/* X CLOSE no canto SUPERIOR DIREITO — pixel-perfect Respond.io
              iteração 15: posicionado absoluto, top-right, border outline.
              Coords no Respond.io: x=1369, y=15 dentro da caixa amber. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t("messages.composer.exitInternal")}
                className="absolute top-2 right-2 size-7 shrink-0 rounded-md border border-amber-500/40 bg-transparent text-amber-200 hover:bg-amber-500/10 hover:text-amber-50"
                onClick={() => {
                  setShowCommentBox(false)
                  setCommentText("")
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <RespondIcon name="close-square" size="md" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t("messages.composer.exitInternal")}
            </TooltipContent>
          </Tooltip>

          {/* LINHA SUPERIOR: avatar 24px do user + textarea */}
          <div className="mb-2 flex items-start gap-2 pr-10">
            <Avatar className="size-6 shrink-0">
              <AvatarImage
                alt={currentUserName}
                src={currentUserImage ?? currentUserSeed.url}
              />
              <AvatarFallback
                className="font-medium text-[10px] text-white"
                style={{ backgroundColor: currentUserSeed.color }}
              >
                {currentUserInitials}
              </AvatarFallback>
            </Avatar>
            <Textarea
              aria-label={t("messages.composer.internalLabel")}
              autoComplete="off"
              className="!bg-transparent dark:!bg-transparent min-h-6 flex-1 resize-none border-0 px-0 py-0.5 text-[14px] text-amber-50 shadow-none placeholder:text-amber-200/60 focus:ring-0 focus-visible:ring-0"
              onChange={handleCommentTextChange}
              onKeyDown={(e) => {
                // Quando mention popover aberto, deixa o popover tratar
                // setas/Enter (ele já tem listener global). Esc também.
                if (
                  mentionTriggerIndex !== null &&
                  ["ArrowUp", "ArrowDown", "Enter", "Escape", "Tab"].includes(
                    e.key,
                  )
                ) {
                  return
                }
                onCommentKeyDown(e)
              }}
              placeholder={t("messages.composer.internalPlaceholder")}
              ref={commentTextareaRef}
              value={commentText}
            />
            <MentionPopover
              anchorEl={commentTextareaRef.current}
              onClose={closeMention}
              onSelect={handleMentionSelect}
              query={mentionQuery}
              triggerIndex={mentionTriggerIndex}
            />
          </div>

          {/* TOOLBAR BOTTOM: ícones esquerda + Send direita.
              Ordem pixel-perfect Respond.io: emoji, attach.
              (Skip magicpen-bold / comments-ai / at — sem feature real,
              Pedro proibiu placeholder fake.) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              <EmojiPicker onSelectEmoji={(e) => setCommentContent(e, true)} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={t("messages.composer.attach")}
                    className="size-8 rounded-md text-amber-200 hover:bg-amber-500/10 hover:text-amber-50"
                    onClick={onClickAttachment}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <RespondIcon name="attach-square" size="lg" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {t("messages.composer.attach")}
                </TooltipContent>
              </Tooltip>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={t("messages.composer.send")}
                  className="size-9 rounded-md bg-amber-500 text-amber-950 hover:bg-amber-400 disabled:bg-amber-500/40 disabled:text-amber-950/60"
                  disabled={!commentText.trim()}
                  onClick={submitComment}
                  size="icon"
                  type="button"
                >
                  <RespondIcon name="send-bold" size="lg" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t("messages.composer.send")}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      ) : (
        // BOTÃO "Adicionar comentário" — abre a caixa suspensa amber.
        // Pixel-perfect Respond.io (Pedro iteração 14): linha discreta
        // que vive ABAIXO da caixa do composer, fora dela. Mantém o
        // wrapper externo px-3 pb-3 do composer principal — fica sem
        // bg/border próprio pra parecer "ancorado" no canvas.
        <button
          aria-label={t("messages.composer.addComment")}
          className={cn(
            "mt-2 inline-flex h-7 items-center gap-2 self-start rounded-[4px] bg-transparent px-2 text-left text-[13px] transition-colors hover:bg-white/[0.04]",
            "text-text-secondary/80 hover:text-text-secondary",
          )}
          onClick={() => {
            setShowCommentBox(true)
            setTimeout(() => commentTextareaRef.current?.focus(), 60)
          }}
          type="button"
        >
          <RespondIcon
            className="text-muted-foreground"
            name="note"
            size="md"
          />
          <span className="font-medium">
            {t("messages.composer.addComment")}
          </span>
        </button>
      )}
    </div>
  )
}
