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
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { createId } from "@paralleldrive/cuid2"
import { GlobeIcon, PaperclipIcon, SendHorizonalIcon } from "lucide-react"
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react"
import { Controller } from "react-hook-form"
import { InstagramIcon } from "@/components/icons/instagram"
import { MessengerIcon } from "@/components/icons/messenger"
import WhatsappIcon from "@/components/icons/whatsapp"
import { authClient } from "@/lib/auth-client"
import type { ClientConversationResource } from "../../chat/store/chat-store"
import { useChatStore } from "../../chat/store/chat-store-provider"
import { createMessageAction } from "../actions/create-message.action"
import { createMessageRequest } from "../schemas/create-message.schema"
import EmojiPicker from "./emoji-picker"
import { FileUploadPreview } from "./file-upload"

export const MessageInput = () => {
  const session = authClient.useSession()

  const inboxTypes: Record<
    InboxType,
    { icon: ReactNode; label: string } | undefined
  > = {
    CHAT_WIDGET: {
      icon: <GlobeIcon height={20} width={20} />,
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
    OMNICHANNEL: undefined,
  }

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { appendMessage, activeConversationId, conversations } = useChatStore(
    (state) => state,
  )

  // Find active conversation
  const [conversation, setConversation] =
    useState<ClientConversationResource | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
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
              senderId: session?.data?.user.id ?? null,
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
    if (!element) {
      return
    }

    const text = element.value
    const before = text.slice(0, element.selectionStart)
    const after = text.slice(element.selectionStart)
    const newText = `${before}${emoji}${after}`

    form.setValue("content", newText)
  }

  const fileUploadRef = useRef(null)
  const onClickAttachment = () => {
    if (fileUploadRef.current) {
      // biome-ignore lint/suspicious/noExplicitAny: wip
      ;(fileUploadRef.current as any).openFileDialog() // Trigger the file dialog
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && e.shiftKey === false) {
      e.preventDefault()
      handleSubmitWithAction()
    }
  }

  return activeConversationId ? (
    <div className="m-3 rounded-xl border pt-2">
      <Form {...form}>
        <form
          className="flex w-full flex-col"
          onSubmit={handleSubmitWithAction}
        >
          <div className="mb-1 w-full px-2.5">
            <Controller
              control={form.control}
              name="content"
              render={({ field }) => (
                <Textarea
                  autoComplete="off"
                  className="h-16 resize-none border-0 px-1.5 py-0 shadow-none focus:ring-0 focus-visible:ring-0"
                  placeholder="Message..."
                  {...field}
                  onKeyDown={onKeyDown}
                  ref={textareaRef}
                />
              )}
            />
          </div>
          <div className="5 px-2">
            <FileUploadPreview ref={fileUploadRef} />
          </div>
          <div className="flex w-full items-center pl-2.5">
            <div className="flex flex-1 items-center gap-1">
              {
                inboxTypes[
                  conversation?.inbox?.inboxType ?? InboxType.CHAT_WIDGET
                ]?.icon
              }
              <span className="text-sm">
                {
                  inboxTypes[
                    conversation?.inbox?.inboxType ?? InboxType.CHAT_WIDGET
                  ]?.label
                }
              </span>
            </div>

            <div className="message-toolbar flex items-center gap-2">
              <Button
                className="px-2 py-1.5 [&_svg]:size-5"
                onClick={onClickAttachment}
                type="button"
                variant="ghost"
              >
                <PaperclipIcon />
              </Button>
              <EmojiPicker onSelectEmoji={onSelectEmoji} />
              <Button
                className="px-2 py-1.5 [&_svg]:size-5"
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
                variant="ghost"
              >
                <SendHorizonalIcon height="32px" width="32px" />
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  ) : null
}
