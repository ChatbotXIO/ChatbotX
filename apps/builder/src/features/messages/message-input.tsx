"use client"

import { InstagramIcon } from "@/components/icons/instagram"
import { MessengerIcon } from "@/components/icons/messenger"
import WhatsappIcon from "@/components/icons/whatsapp"
import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import { Textarea } from "@/components/ui/textarea"
import {
  ContentType,
  InboxType,
  MessageType,
  SenderType,
} from "@ahachat.ai/database/types"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { createId } from "@paralleldrive/cuid2"
import { GlobeIcon, PaperclipIcon, SendHorizonalIcon } from "lucide-react"
import { useSession } from "next-auth/react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Controller } from "react-hook-form"
import type { ClientConversationResource } from "../chat/store/chat-store"
import { useChatStore } from "../chat/store/chat-store-provider"
import { createMessageAction } from "./actions/create-message.action"
import EmojiPicker from "./components/emoji-picker"
import { FileUploadPreview } from "./components/file-upload"
import { createMessageRequest } from "./schemas/create-message.schema"

export const MessageInput = () => {
  const { data: session } = useSession()

  const inboxTypes: Record<InboxType, { icon: ReactNode; label: string }> = {
    CHAT_WIDGET: {
      icon: <GlobeIcon width={20} height={20} />,
      label: "Chat Widget",
    },
    INSTAGRAM: {
      icon: <InstagramIcon />,
      label: "Instagram",
    },
    MESSENGER: {
      icon: <MessengerIcon />,
      label: "Facebook Messenger",
    },
    WHATSAPP: {
      icon: <WhatsappIcon />,
      label: "Whatsapp",
    },
  }

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { appendMessage, activeConversationId, conversations } = useChatStore(
    (state) => state,
  )

  // Find active conversation
  const [conversation, setConversation] =
    useState<ClientConversationResource | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    setConversation(
      conversations.find((c) => c.id === activeConversationId) ?? null,
    )
  }, [activeConversationId])

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { setValue, reset },
  } = useHookFormAction(
    createMessageAction.bind(
      null,
      conversation?.chatbotId ?? "",
      conversation?.id ?? "",
    ),
    zodResolver(createMessageRequest),
    {
      actionProps: {
        onExecute: ({ input }) => {
          // try to push raw message to store
          if ("content" in input && input.content) {
            appendMessage({
              content: input.content as string,
              id: createId(),
              createdAt: new Date(),
              updatedAt: new Date(),
              chatbotId: conversation?.chatbotId ?? "",
              inboxId: conversation?.inboxId ?? "",
              sourceId: null,
              conversationId: conversation?.id ?? "",
              contentAttributes: null,
              messageType: MessageType.OUTGOING,
              contentType: ContentType.TEXT,
              senderType: SenderType.USER,
              senderId: session?.user.id ?? null,
              clientId: input.clientId,
            })
          }

          reset()
          textareaRef.current?.focus()
        },
        onSuccess: () => {
          textareaRef.current?.focus()
          resetFormAndAction()

          setValue("clientId", createId())
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

  const onSelectEmoji = (emoji: string) => {
    const element = textareaRef.current
    if (!element) return

    const text = element.value
    const before = text.slice(0, element.selectionStart)
    const after = text.slice(element.selectionStart)
    const newText = `${before}${emoji}${after}`

    form.setValue("content", newText)
  }

  const fileUploadRef = useRef(null)
  const onClickAttachment = () => {
    if (fileUploadRef.current) {
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      ;(fileUploadRef.current as any).openFileDialog() // Trigger the file dialog
    }
  }

  return activeConversationId ? (
    <div className="rounded-xl m-3 pt-2 border">
      <Form {...form}>
        <form
          onSubmit={handleSubmitWithAction}
          className="w-full flex flex-col"
        >
          <div className="w-full px-2.5 mb-1">
            <Controller
              control={form.control}
              name="content"
              render={({ field }) => (
                <Textarea
                  autoComplete="off"
                  className="resize-none h-16 border-0 shadow-none focus:ring-0 focus-visible:ring-0 px-1.5 py-0"
                  placeholder="Message..."
                  {...field}
                  ref={textareaRef}
                />
              )}
            />
          </div>
          <div className="px-2 5">
            <FileUploadPreview ref={fileUploadRef} />
          </div>
          <div className="flex w-full items-center pl-2.5">
            <div className="flex-1 flex gap-1 items-center">
              {
                inboxTypes[
                  conversation?.inbox?.inboxType ?? InboxType.CHAT_WIDGET
                ].icon
              }
              <span className="text-sm">
                {
                  inboxTypes[
                    conversation?.inbox?.inboxType ?? InboxType.CHAT_WIDGET
                  ].label
                }
              </span>
            </div>

            <div className="message-toolbar flex gap-2 items-center">
              <Button
                variant="ghost"
                type="button"
                className="[&_svg]:size-5 px-2 py-1.5"
                onClick={onClickAttachment}
              >
                <PaperclipIcon />
              </Button>
              <EmojiPicker onSelectEmoji={onSelectEmoji} />
              <Button
                variant="ghost"
                type="submit"
                className="[&_svg]:size-5 px-2 py-1.5"
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
              >
                <SendHorizonalIcon width="32px" height="32px" />
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  ) : null
}
