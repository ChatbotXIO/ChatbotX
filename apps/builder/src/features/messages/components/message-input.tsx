"use client"

import {
  ContentType,
  InboxType,
  MessageType,
  SenderType,
} from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form } from "@aha.chat/ui/components/ui/form"
import { Textarea } from "@aha.chat/ui/components/ui/textarea"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  type IconType,
  SiMessenger,
  SiWhatsapp,
  SiZalo,
} from "@icons-pack/react-simple-icons"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { createId } from "@paralleldrive/cuid2"
import {
  GlobeIcon,
  type LucideIcon,
  PaperclipIcon,
  SendHorizonalIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { type KeyboardEvent, useCallback, useMemo, useRef } from "react"
import { Controller } from "react-hook-form"
import { authClient } from "@/lib/auth/auth-client"
import { useChatStore } from "../../chat/store/chat-store-provider"
import { createMessageAction } from "../actions/create-message.action"
import { createMessageRequest } from "../schemas/create-message.schema"
import EmojiPicker from "./emoji-picker"
import { FileUploadPreview } from "./file-upload"

// Memoize inbox types configuration to prevent recreation on every render
const createInboxTypes = (
  t: (key: string) => string,
): Record<
  InboxType | "omnichannel",
  { icon: IconType | LucideIcon; label: string } | undefined
> => ({
  webchat: {
    icon: GlobeIcon,
    label: t("webchat.title"),
  },
  messenger: {
    icon: SiMessenger,
    label: t("messenger.title"),
  },
  whatsapp: {
    icon: SiWhatsapp,
    label: t("whatsapp.title"),
  },
  omnichannel: undefined,
  zalo: {
    icon: SiZalo,
    label: t("zalo.title"),
  },
})

export const MessageInput = () => {
  const session = authClient.useSession()
  const t = useTranslations()

  // Memoize inbox types to prevent recreation on every render
  const inboxTypes = useMemo(() => createInboxTypes(t), [t])

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileUploadRef = useRef<HTMLInputElement>(null)

  const { appendMessage, activeConversationId, conversations } = useChatStore(
    (state) => state,
  )

  // Memoize active conversation to prevent unnecessary re-renders
  const conversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  )

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createMessageAction.bind(
        null,
        conversation?.chatbotId ?? "",
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
              "content" in input &&
              input.content
            ) {
              const typedInput = input as { content: string; clientId: string }
              appendMessage({
                content: typedInput.content,
                id: createId(),
                createdAt: new Date(),
                updatedAt: new Date(),
                chatbotId: conversation?.chatbotId ?? "",
                inboxId: conversation?.inboxId ?? "",
                sourceId: null,
                conversationId: conversation?.id ?? "",
                contentAttributes: null,
                messageType: MessageType.outgoing,
                contentType: ContentType.text,
                senderType: SenderType.user,
                senderId: session?.data?.user.id ?? null,
                clientId: typedInput.clientId,
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
            content: "",
            files: [],
            clientId: createId(),
          },
        },
        errorMapProps: {},
      },
    )

  // Memoize emoji selection handler
  const onSelectEmoji = useCallback(
    (emoji: string) => {
      const element = textareaRef.current
      if (!element) {
        return
      }

      const text = element.value
      const before = text.slice(0, element.selectionStart)
      const after = text.slice(element.selectionStart)
      const newText = `${before}${emoji}${after}`

      form.setValue("content", newText)
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

  // Memoize keyboard handler
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && e.shiftKey === false) {
        e.preventDefault()
        handleSubmitWithAction()
      }
    },
    [handleSubmitWithAction],
  )

  // Memoize inbox type and icon for current conversation
  const currentInboxType = conversation?.inbox?.inboxType ?? InboxType.webchat
  const inboxConfig = inboxTypes[currentInboxType as InboxType]
  const IconComponent = inboxConfig?.icon

  // Early return if no active conversation
  if (!activeConversationId) {
    return null
  }

  return (
    <div className="m-3 rounded-xl border pt-2">
      <Form {...form}>
        <form
          aria-label="Message input form"
          className="flex w-full flex-col"
          onSubmit={handleSubmitWithAction}
        >
          <div className="mb-1 w-full px-2.5 py-1">
            <Controller
              control={form.control}
              name="content"
              render={({ field }) => (
                <Textarea
                  aria-label="Type your message"
                  autoComplete="off"
                  className="h-16 resize-none border-0 px-1.5 py-0 shadow-none focus:ring-0 focus-visible:ring-0 dark:bg-neutral-900"
                  placeholder="Message..."
                  {...field}
                  onKeyDown={onKeyDown}
                  ref={textareaRef}
                />
              )}
            />
          </div>
          <div className="px-2">
            <FileUploadPreview ref={fileUploadRef} />
          </div>
          <div className="flex w-full items-center pl-2.5">
            <div className="flex flex-1 items-center gap-1">
              {IconComponent && (
                <IconComponent
                  aria-hidden="true"
                  className="size-4"
                  focusable="false"
                />
              )}
              <span className="text-sm">{inboxConfig?.label}</span>
            </div>

            <div className="message-toolbar flex items-center gap-2">
              <Button
                aria-label="Attach file"
                className="px-2 py-1.5 [&_svg]:size-5"
                onClick={onClickAttachment}
                type="button"
                variant="ghost"
              >
                <PaperclipIcon aria-hidden="true" />
              </Button>
              <EmojiPicker onSelectEmoji={onSelectEmoji} />
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
