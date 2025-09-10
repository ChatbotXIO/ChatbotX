"use client"

import { ContentType, MessageType, SenderType } from "@aha.chat/database/types"
import { getImageDimensions } from "@aha.chat/ui"
import { EmojiPickerPopup } from "@aha.chat/ui/components/emoji-picker-popup"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  FileUpload,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadItemProgress,
  FileUploadList,
  FileUploadTrigger,
} from "@aha.chat/ui/components/ui/file-upload"
import { Form } from "@aha.chat/ui/components/ui/form"
import {
  FILE_SIZE_LIMITS,
  FILE_TYPE_GROUPS,
} from "@aha.chat/ui/lib/file-config"
import { cn } from "@aha.chat/ui/lib/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { createId } from "@paralleldrive/cuid2"
import { PaperclipIcon, SendHorizonalIcon, XIcon } from "lucide-react"
import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
} from "react"
import { createWebchatMessageAction } from "../messages/actions/create-webchat-message.action"
import { useChatFileUpload } from "../messages/hooks/use-chat-file-upload"
import {
  createWebchatMessageRequest,
  guessFileTypeFromMimeType,
} from "../messages/schemas/create-message.schema"
import { useGuestSessionStore } from "./providers/store/guest-session-provider"

type WebchatInputProps = {
  chatbotId: string
}

export const WebchatInput = ({ chatbotId }: WebchatInputProps) => {
  const { appendMessage, guestConversationId } = useGuestSessionStore(
    (state) => state,
  )

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Use the custom file upload hook
  const {
    files,
    isUploading,
    onUpload: handleFileUpload,
    onFileReject,
    setFiles: setFilesList,
  } = useChatFileUpload({
    uploadPath: `public/webchat/${chatbotId}`,
    validation: {
      maxSize: FILE_SIZE_LIMITS.DEFAULT,
      maxFiles: 1,
      allowedTypes: FILE_TYPE_GROUPS.ALL,
    },
    onUploadSuccess: async (filePath, file) => {
      // Store the uploaded file path in form data
      form.setValue("attachment.originPath", filePath)
      form.setValue("attachment.name", file.name)
      form.setValue("attachment.size", file.size)
      form.setValue("attachment.mimeType", file.type)
      form.setValue("attachment.fileType", guessFileTypeFromMimeType(file.type))

      if (file.type.startsWith("image/")) {
        const { width, height } = await getImageDimensions(file)
        form.setValue("attachment.width", width)
        form.setValue("attachment.height", height)
      }

      await handleSubmitWithAction()
    },
  })

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { setValue, reset },
  } = useHookFormAction(
    createWebchatMessageAction,
    zodResolver(createWebchatMessageRequest),
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
              chatbotId: "",
              inboxId: "",
              sourceId: null,
              conversationId: "",
              contentAttributes: null,
              messageType: MessageType.INCOMING,
              contentType: ContentType.TEXT,
              senderType: SenderType.CONTACT,
              senderId: "",
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
          setValue("chatbotId", chatbotId)
          setValue(
            "guestConversationId",
            localStorage.getItem("x-conversation-id") ?? "",
          )

          // Clear files from upload hook
          setFilesList([])
        },
      },
      formProps: {
        defaultValues: {
          content: "",
          clientId: createId(),
          chatbotId: chatbotId ?? "",
          guestConversationId: guestConversationId ?? "",
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

  const watchContent = form.watch("content")

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && e.shiftKey === false) {
        e.preventDefault()
        if (form.getValues("content").length > 0) {
          handleSubmitWithAction()
        }
      }
    },
    [handleSubmitWithAction, form],
  )

  const handleSubmit = async () => {
    // Upload files first if any are selected
    if (files.length > 0) {
      await handleFileUpload(files)
    }

    if (form.getValues("content").length > 0) {
      await handleSubmitWithAction()
    }
  }

  const insertTextAtCursor = useCallback(
    (textToInsert: string) => {
      const textarea = textareaRef.current
      if (!textarea) {
        return
      }

      const start = textarea.selectionStart
      const end = textarea.selectionEnd

      // Construct the new value by inserting the text
      const newValue =
        textarea.value.substring(0, start) +
        textToInsert +
        textarea.value.substring(end)

      // Update the state with the new value
      form.setValue("content", newValue)
      form.trigger("content")

      // Set the cursor position after insertion
      // Use a timeout to ensure the DOM updates before setting selection
      setTimeout(() => {
        textarea.setSelectionRange(
          start + textToInsert.length,
          start + textToInsert.length,
        )
        textarea.focus()
      }, 0)
    },
    [form],
  )

  const hasContent = watchContent && watchContent.trim().length > 0
  const isFormValid = form.formState.isValid && !form.formState.isSubmitting

  return (
    <div className="m-3 rounded-xl border">
      <Form {...form}>
        <FileUpload
          className="relative w-full items-center p-3"
          disabled={isUploading}
          maxFiles={1}
          maxSize={FILE_SIZE_LIMITS.DEFAULT}
          onFileReject={onFileReject}
          onValueChange={setFilesList}
          value={files}
        >
          <form className="flex w-full flex-col">
            <FileUploadList
              className="overflow-x-auto px-0 py-1"
              orientation="horizontal"
            >
              {files.map((file, index) => (
                <FileUploadItem
                  className="max-w-52 p-1.5"
                  // biome-ignore lint/suspicious/noArrayIndexKey: wip
                  key={index}
                  value={file}
                >
                  <FileUploadItemPreview className="size-8 [&>svg]:size-5">
                    <FileUploadItemProgress variant="fill" />
                  </FileUploadItemPreview>
                  <FileUploadItemMetadata size="sm" />
                  <FileUploadItemDelete asChild>
                    <Button
                      aria-label={`Remove ${file.name}`}
                      className="-top-1 -right-1 absolute size-4 shrink-0 cursor-pointer rounded-full"
                      size="icon"
                      variant="secondary"
                    >
                      <XIcon className="size-2.5" />
                    </Button>
                  </FileUploadItemDelete>
                </FileUploadItem>
              ))}
            </FileUploadList>

            <TextareaField
              aria-label="Message input"
              autoComplete="off"
              className={cn(
                "h-16 resize-none border-0 p-0 shadow-none focus:ring-0 focus-visible:ring-0",
                files.length > 0 ? "hidden" : "block",
              )}
              name="content"
              onKeyDown={(e) => onKeyDown(e as unknown as KeyboardEvent)}
              placeholder="Message..."
              ref={textareaRef as RefObject<HTMLTextAreaElement>}
            />

            <div className="flex w-full items-center gap-1.5">
              <div className="flex flex-1 items-center gap-1">
                <span className="font-medium text-muted-foreground text-sm">
                  Web Chat
                </span>
              </div>

              <div className="flex items-center">
                <div
                  className={cn(
                    "duration-300 ease-in-out",
                    hasContent || files.length ? "hidden" : "block",
                  )}
                >
                  <FileUploadTrigger asChild>
                    <Button
                      aria-label="Attach file"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <PaperclipIcon className="size-5" />
                    </Button>
                  </FileUploadTrigger>
                </div>

                <EmojiPickerPopup
                  className={cn(
                    "duration-300 ease-in-out",
                    hasContent || files.length === 0 ? "inline-flex" : "hidden",
                  )}
                  onEmojiSelect={insertTextAtCursor}
                />

                <Button
                  aria-label="Send message"
                  className={cn(
                    "duration-300 ease-in-out",
                    hasContent || files.length ? "inline-flex" : "hidden",
                  )}
                  disabled={!isFormValid && files.length === 0}
                  onClick={handleSubmit}
                  type="button"
                  variant="ghost"
                >
                  <SendHorizonalIcon className="size-5" />
                </Button>
              </div>
            </div>
          </form>
        </FileUpload>
      </Form>
    </div>
  )
}
