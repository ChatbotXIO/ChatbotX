"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { createId } from "@chatbotx.io/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { PaperclipIcon, SendHorizonalIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type KeyboardEvent, useCallback, useMemo, useRef } from "react"
import { Controller, useWatch } from "react-hook-form"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { QuickRepliesPopover } from "@/features/saved-replies/quick-replies-popover"
import { authClient } from "@/lib/auth/auth-client"
import { useChatStore } from "../../chat/store/chat-store-provider"
import { createMessageAction } from "../actions/create-message.action"
import { createMessageRequest } from "../schema/mutation"
import { FileUploadPreview } from "./file-upload"
import { InputMenu } from "./input-menu"

export const MessageInput = () => {
  const t = useTranslations()
  const session = authClient.useSession()

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
          },
        },
        errorMapProps: {},
      },
    )

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

  // Memoize keyboard handler
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

  // Check if conversation is over 7 days since last contact reply
  // const isOver7Days = useMemo(() => {
  //   if (!conversation?.messages.length) {
  //     return false
  //   }

  //   const sevenDaysAgo = new Date()
  //   sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  //   return conversation.contactRepliedAt
  //     ? new Date(conversation.contactRepliedAt) < sevenDaysAgo
  //     : false
  // }, [conversation])
  const isDisabled = false
  // const isDisabled = useMemo(() => {
  //   return isOver7Days && currentInboxType === "messenger"
  // }, [isOver7Days])
  const placeholder = isDisabled ? t("messages.userInactive") : "Message..."

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
          <div className="px-2">
            <FileUploadPreview ref={fileUploadRef} />
          </div>
          <div className="flex w-full items-center pl-2.5">
            <div className="flex-1">
              <InboxIcon
                channel={
                  (conversation?.contactInboxes[0]?.channel ??
                    "webchat") as ChannelType
                }
              />
            </div>

            {!isDisabled && (
              <div className="message-toolbar flex items-center gap-2">
                {!hasFiles && <InputMenu setContent={setContent} />}
                <Button
                  aria-label="Attach file"
                  className="px-2 py-1.5 [&_svg]:size-5"
                  onClick={onClickAttachment}
                  type="button"
                  variant="ghost"
                >
                  <PaperclipIcon aria-hidden="true" />
                </Button>
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
            )}
          </div>
        </form>
      </Form>
    </div>
  )
}
