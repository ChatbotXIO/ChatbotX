"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { Form } from "@aha.chat/ui/components/ui/form"
import { Textarea } from "@aha.chat/ui/components/ui/textarea"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { createId } from "@paralleldrive/cuid2"
import { PaperclipIcon, SendHorizonalIcon } from "lucide-react"
import { type KeyboardEvent, useEffect, useMemo, useRef } from "react"
import { Controller, useWatch } from "react-hook-form"
import { createWebchatMessageAction } from "../messages/actions/create-webchat-message.action"
import EmojiPicker from "../messages/components/emoji-picker"
import { FileUploadPreview } from "../messages/components/file-upload"
import { createWebchatMessageRequest } from "../messages/schemas/create-message.schema"
import WebchatMessageMenu from "./components/webchat-message-menu"
import { useGuestSessionStore } from "./providers/store/guest-session-provider"

type WebchatMessageInputProps = {
  chatbotId: string
  webchatId: string
  referral?: string
}

export const WebchatMessageInput = ({
  chatbotId,
  webchatId,
  referral,
}: WebchatMessageInputProps) => {
  const { sendMessage, guestConversationId } = useGuestSessionStore(
    (state) => state,
  )

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const defaultValues = useMemo(
    () => ({
      content: "",
      files: [],
      chatbotId,
      webchatId,
      guestConversationId: guestConversationId ?? "",
      ref: referral,
    }),
    [chatbotId, webchatId, guestConversationId, referral],
  )

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { control, setValue, resetField, reset },
  } = useHookFormAction(
    createWebchatMessageAction,
    zodResolver(createWebchatMessageRequest),
    {
      actionProps: {
        onExecute: ({ input }) => {
          // try to push raw message to store
          if ("content" in input && input.content) {
            sendMessage(input.content)
          }

          resetField("content")
          textareaRef.current?.focus()
        },
        onSuccess: () => {
          textareaRef.current?.focus()
          resetFormAndAction()

          reset(defaultValues)
          setValue("clientId", createId())
        },
      },
      formProps: {
        defaultValues: {
          ...defaultValues,
          clientId: createId(),
        },
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    if (guestConversationId) {
      setValue("guestConversationId", guestConversationId)
    }
  }, [guestConversationId, setValue])

  const files = useWatch({ control, name: "files" })
  const content = useWatch({ control, name: "content" })

  useEffect(() => {
    if (files.length > 0) {
      resetField("content")
    }
  }, [files, resetField])

  const onSelectEmoji = (emoji: string) => {
    if (files.length > 0) {
      return
    }

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

  const onKeyDown = async (e: KeyboardEvent) => {
    if (files.length > 0 || e.nativeEvent.isComposing || e.key === "Process") {
      return
    }

    if (e.key === "Enter" && e.shiftKey === false) {
      e.preventDefault()

      await handleSubmitWithAction()
    }
  }

  return (
    <div className="m-3 rounded-xl border pt-2">
      <Form {...form}>
        <form
          className="flex w-full flex-col"
          onSubmit={handleSubmitWithAction}
        >
          {files.length === 0 && (
            <div className="mb-1 w-full px-2.5 py-1">
              <Controller
                control={form.control}
                name="content"
                render={({ field }) => (
                  <Textarea
                    autoComplete="off"
                    className="h-16 resize-none border-0 px-1.5 py-0 shadow-none focus:ring-0 focus-visible:ring-0"
                    disabled={files.length > 0}
                    placeholder="Message..."
                    {...field}
                    onKeyDown={onKeyDown}
                    ref={textareaRef}
                  />
                )}
              />
            </div>
          )}
          <div className="5 px-2">
            <FileUploadPreview ref={fileUploadRef} />
          </div>
          <div className="flex w-full items-center pl-2.5">
            <div className="flex-1">
              <WebchatMessageMenu chatbotId={chatbotId} webchatId={webchatId} />
            </div>
            <div className="message-toolbar flex items-center">
              {!content && (
                <Button
                  className="px-2 py-1.5 [&_svg]:size-5"
                  disabled={!chatbotId}
                  onClick={onClickAttachment}
                  type="button"
                  variant="ghost"
                >
                  <PaperclipIcon />
                </Button>
              )}
              <EmojiPicker
                disabled={files.length > 0}
                onSelectEmoji={onSelectEmoji}
              />
              <Button
                className="px-2 py-1.5 [&_svg]:size-5"
                disabled={
                  !(chatbotId && form.formState.isValid) ||
                  form.formState.isSubmitting
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
  )
}
