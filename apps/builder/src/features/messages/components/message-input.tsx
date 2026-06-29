"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { createId } from "@chatbotx.io/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import {
  PaperclipIcon,
  ReplyIcon,
  SendHorizonalIcon,
  XIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Controller, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { disableBotAction } from "@/features/conversations/actions/disable-bot.action"
import {
  BOT_DISABLE_DURATION_MS,
  isConversationActive,
} from "@/features/conversations/utils/bot-state"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { QuickRepliesPopover } from "@/features/saved-replies/quick-replies-popover"
import { authClient } from "@/lib/auth/auth-client"
import { useChatStore } from "../../chat/store/chat-store-provider"
import { createMessageAction } from "../actions/create-message.action"
import { createMessageRequest } from "../schema/mutation"
import { FileUploadPreview } from "./file-upload"
import { InputMenu } from "./input-menu"

const CHANNEL_WINDOW_SECONDS: Record<ChannelType, number> = {
  omnichannel: 0,
  webchat: 0,
  messenger: 24 * 60 * 60,
  whatsapp: 24 * 60 * 60,
  zalo: 0,
  smtp: 0,
  telegram: 0,
  instagram: 24 * 60 * 60,
  tiktok: 0,
}

const MESSENGER_HUMAN_AGENT_WINDOW_SECONDS = 7 * 24 * 60 * 60

export const MessageInput = () => {
  const t = useTranslations()
  const session = authClient.useSession()

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileUploadRef = useRef<HTMLInputElement>(null)

  const {
    appendMessage,
    activeConversationId,
    conversations,
    updateConversation,
    replyToMessage,
    setReplyToMessage,
    messages,
  } = useChatStore((state) => state)

  const lastContactComment = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (
        m.messageType === "incoming" &&
        m.type === "comment" &&
        m.deletedAt == null &&
        m.id
      ) {
        return m
      }
    }
    return null
  }, [messages])

  // Memoize active conversation to prevent unnecessary re-renders
  const conversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  )

  const { execute: disableBot } = useAction(
    disableBotAction.bind(null, conversation?.workspaceId ?? ""),
    {
      onSuccess: () => {
        if (conversation) {
          updateConversation(conversation.id, {
            botEnabled: false,
            botResumeAt: new Date(Date.now() + BOT_DISABLE_DURATION_MS),
          })
        }
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

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
            // try to push raw message to store
            if (
              typeof input === "object" &&
              input !== null &&
              "text" in input &&
              input.text
            ) {
              const typedInput = input as { text: string; clientId: string }
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
                deletedAt: null,
                type: "message",
                parentId: null,
                attributes: null,
              })
            }

            form.reset()
            textareaRef.current?.focus()
          },
          onSuccess: () => {
            if (conversation && isConversationActive(conversation)) {
              disableBot({ ids: [conversation.id] })
            }
            setReplyToMessage(null)
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
            replyToMessageId: undefined,
            replyToMessageCreatedAt: undefined,
          },
        },
        errorMapProps: {},
      },
    )

  // Sync replyToMessage store state → form field and focus input
  useEffect(() => {
    form.setValue("replyToMessageId", replyToMessage?.id ?? undefined)
    form.setValue(
      "replyToMessageCreatedAt",
      replyToMessage?.createdAt ?? undefined,
    )
    if (replyToMessage) {
      textareaRef.current?.focus()
    }
  }, [form, replyToMessage])

  // Memoize emoji selection handler
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

  // Memoize attachment click handler
  const onClickAttachment = useCallback(() => {
    if (fileUploadRef.current) {
      // biome-ignore lint/suspicious/noExplicitAny: wip
      ;(fileUploadRef.current as any).openFileDialog() // Trigger the file dialog
    }
  }, [])

  const sendMessage = useCallback(() => {
    if (!replyToMessage && lastContactComment) {
      form.setValue("replyToMessageId", lastContactComment.id)
      form.setValue(
        "replyToMessageCreatedAt",
        lastContactComment.createdAt ?? undefined,
      )
    }
    handleSubmitWithAction()
  }, [replyToMessage, lastContactComment, form, handleSubmitWithAction])

  // Memoize keyboard handler
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.nativeEvent.isComposing || e.key === "Process") {
        return
      }
      if (e.key === "Enter" && e.shiftKey === false) {
        e.preventDefault()
        sendMessage()
      }
    },
    [sendMessage],
  )

  const isInstagramPostComment =
    conversation?.contactInboxes[0]?.channel === "instagram" &&
    conversation?.sourceId != null

  const [isHumanAgentUnlocked, setIsHumanAgentUnlocked] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset unlock state when conversation changes
  useEffect(() => {
    setIsHumanAgentUnlocked(false)
  }, [activeConversationId])

  const channel = conversation?.contactInboxes[0]?.channel

  // Parse lastIncomingMessageAt into a numeric timestamp once. Using a scalar
  // as a memo dependency is more stable than the whole contactInboxes array.
  // Returns null if the field is absent or not a valid date (NaN guard).
  const lastIncomingTs = useMemo(() => {
    const raw = conversation?.contactInboxes[0]?.lastIncomingMessageAt
    if (!raw) {
      return null
    }
    const ts = new Date(raw).getTime()
    return Number.isFinite(ts) ? ts : null
  }, [conversation?.contactInboxes])

  // clockTick is a counter that exists solely to invalidate the window-expiry
  // memos below. Because Date.now() is called inside useMemo and captured at
  // render time, the memos would never detect expiry on their own. We schedule
  // a single setTimeout to fire at the next window boundary; when it fires,
  // clockTick increments, causing the memos to recompute with the current time.
  const [clockTick, setClockTick] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: clockTick is the invalidation trigger
  useEffect(() => {
    if (!(lastIncomingTs && channel)) {
      return
    }
    // Collect all upcoming window boundaries for this channel/contact pair.
    const windowSeconds = CHANNEL_WINDOW_SECONDS[channel as ChannelType]
    const deadlines: number[] = []
    if (windowSeconds) {
      deadlines.push(lastIncomingTs + windowSeconds * 1000)
    }
    if (
      channel === "messenger" ||
      (channel === "instagram" && !isInstagramPostComment)
    ) {
      deadlines.push(
        lastIncomingTs + MESSENGER_HUMAN_AGENT_WINDOW_SECONDS * 1000,
      )
    }
    // Schedule a timeout for the nearest future boundary. When it fires,
    // clockTick increments and the effect re-runs to schedule the next one.
    const next = deadlines.filter((d) => d > Date.now()).sort()[0]
    if (!next) {
      return
    }
    const timeout = setTimeout(
      () => setClockTick((t) => t + 1),
      next - Date.now(),
    )
    return () => clearTimeout(timeout)
  }, [lastIncomingTs, channel, isInstagramPostComment, clockTick])

  // biome-ignore lint/correctness/useExhaustiveDependencies: clockTick forces recompute at window boundary
  const isWindowExpired = useMemo(() => {
    if (!(lastIncomingTs && channel)) {
      return false
    }
    const windowSeconds = CHANNEL_WINDOW_SECONDS[channel as ChannelType]
    if (!windowSeconds) {
      return false
    }
    return Date.now() - lastIncomingTs > windowSeconds * 1000
  }, [channel, lastIncomingTs, clockTick])

  const isMessengerWindowClosed = useMemo(
    () =>
      (channel === "messenger" ||
        (channel === "instagram" && !isInstagramPostComment)) &&
      isWindowExpired,
    [channel, isInstagramPostComment, isWindowExpired],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: clockTick forces recompute at window boundary
  const isMessengerHumanAgentWindowExpired = useMemo(() => {
    const isMetaDm =
      channel === "messenger" ||
      (channel === "instagram" && !isInstagramPostComment)
    if (!(isMetaDm && lastIncomingTs)) {
      return false
    }
    return (
      Date.now() - lastIncomingTs > MESSENGER_HUMAN_AGENT_WINDOW_SECONDS * 1000
    )
  }, [channel, lastIncomingTs, isInstagramPostComment, clockTick])

  const isWhatsappWindowClosed = useMemo(
    () => channel === "whatsapp" && isWindowExpired,
    [channel, isWindowExpired],
  )

  // Check if files are attached
  const files = useWatch({
    control: form.control,
    name: "files",
  })
  const hasFiles = Array.isArray(files) && files.length > 0

  // Early return if no active conversation
  if (!activeConversationId) {
    return null
  }

  if (isMessengerHumanAgentWindowExpired) {
    return (
      <div className="m-3 rounded-xl border pt-2">
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-6 text-center">
          <p className="text-muted-foreground text-sm">
            {t("messages.humanAgentWindowExpired")}
          </p>
        </div>
      </div>
    )
  }

  if (isMessengerWindowClosed && !isHumanAgentUnlocked) {
    return (
      <div className="m-3 rounded-xl border pt-2">
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-6 text-center">
          <p className="text-muted-foreground text-sm">
            {t("messages.messagingWindowClosed")}
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline">
                {t("messages.sendHumanAgentTag")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("messages.warning")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("messages.humanAgentWarningDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => setIsHumanAgentUnlocked(true)}
                >
                  {t("actions.continue")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    )
  }

  if (isWhatsappWindowClosed) {
    return (
      <div className="m-3 rounded-xl border pt-2">
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-6 text-center">
          <p className="text-muted-foreground text-sm">
            {t("messages.messagingWindowClosed")}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="m-3 rounded-xl border pt-2">
      <Form {...form}>
        <form
          aria-label="Message input form"
          className="flex w-full flex-col"
          onSubmit={(e) => {
            e.preventDefault()
            sendMessage()
          }}
        >
          {replyToMessage && (
            <div className="mx-2.5 mb-1 flex items-start gap-2 rounded-lg border-primary bg-muted px-3 py-2 text-sm">
              <ReplyIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span className="flex-1 truncate text-muted-foreground">
                {replyToMessage.text || t("messages.facebookComment")}
              </span>
              <Button
                aria-label="Clear reply"
                className="size-4 shrink-0 p-0"
                onClick={() => setReplyToMessage(null)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          )}
          <div className="mb-1 w-full px-2.5 py-1">
            <Controller
              control={form.control}
              name="text"
              render={({ field }) => (
                <QuickRepliesPopover
                  inputValue={field.value ?? ""}
                  onSelect={setContent}
                >
                  <Textarea
                    aria-label="Type your message"
                    autoComplete="off"
                    className="h-16 resize-none border-0 px-1.5 py-1 shadow-none focus:ring-0 focus-visible:ring-0 dark:bg-neutral-900"
                    placeholder="Message..."
                    {...field}
                    onKeyDown={onKeyDown}
                    ref={textareaRef}
                  />
                </QuickRepliesPopover>
              )}
            />
          </div>
          {!isInstagramPostComment && (
            <div className="px-2">
              <FileUploadPreview ref={fileUploadRef} />
            </div>
          )}
          <div className="flex w-full items-center pl-2.5">
            <div className="flex-1">
              <InboxIcon
                channel={
                  (conversation?.contactInboxes[0]?.channel ??
                    "webchat") as ChannelType
                }
              />
            </div>

            <div className="message-toolbar flex items-center gap-2">
              {!hasFiles && <InputMenu setContent={setContent} />}
              {!isInstagramPostComment && (
                <Button
                  aria-label="Attach file"
                  className="px-2 py-1.5 [&_svg]:size-5"
                  onClick={onClickAttachment}
                  type="button"
                  variant="ghost"
                >
                  <PaperclipIcon aria-hidden="true" />
                </Button>
              )}
              <Button
                aria-label="Send message"
                className="px-2 py-1.5 [&_svg]:size-5"
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
                variant="ghost"
              >
                <SendHorizonalIcon
                  aria-hidden="true"
                  height="32px"
                  width="32px"
                />
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  )
}
