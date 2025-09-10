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
import {
  SiInstagram,
  SiMessenger,
  SiWhatsapp,
} from "@icons-pack/react-simple-icons"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { createId } from "@paralleldrive/cuid2"
import {
  GlobeIcon,
  PaperclipIcon,
  SendHorizonalIcon,
  XIcon,
} from "lucide-react"
import { type RefObject, useCallback, useMemo, useRef } from "react"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { authClient } from "@/lib/auth-client"
import { createMessageAction } from "../actions/create-message.action"
import { useChatFileUpload } from "../hooks/use-chat-file-upload"
import {
  createMessageRequest,
  guessFileTypeFromMimeType,
} from "../schemas/create-message.schema"

// Extract inbox configurations to avoid recreating on every render
const INBOX_CONFIGS = {
  WEBCHAT: {
    icon: GlobeIcon,
    color: "none",
    label: "Web Chat",
  },
  INSTAGRAM: {
    icon: SiInstagram,
    color: "#FF0069",
    label: "Instagram",
  },
  MESSENGER: {
    icon: SiMessenger,
    color: "#0866FF",
    label: "Messenger",
  },
  WHATSAPP: {
    icon: SiWhatsapp,
    color: "#25D366",
    label: "Whatsapp",
  },
  OMNICHANNEL: undefined,
} as const

export function ChatInput() {
  const session = authClient.useSession()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Optimize store selectors to only get what we need
  const { appendMessage, activeConversationId, conversations } = useChatStore(
    (state) => state,
    // useCallback(
    // (state) => ({
    //   appendMessage: state.appendMessage,
    //   activeConversationId: state.activeConversationId,
    //   conversations: state.conversations,
    // }),
    //   [],
    // ),
  )

  // Use the custom file upload hook
  const {
    files,
    isUploading,
    onUpload: handleFileUpload,
    onFileReject,
    setFiles: setFilesList,
  } = useChatFileUpload({
    uploadPath: `public/conversations/${activeConversationId}`,
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

  // Memoize conversation lookup to avoid unnecessary re-renders
  const conversation = useMemo(() => {
    return conversations.find((c) => c.id === activeConversationId) ?? null
  }, [activeConversationId, conversations])

  // Memoize inbox config to avoid unnecessary re-renders
  const inboxConfig = useMemo(() => {
    if (!conversation?.inbox?.inboxType) {
      return null
    }
    return INBOX_CONFIGS[conversation.inbox.inboxType] ?? null
  }, [conversation?.inbox?.inboxType])

  // Memoize form action to avoid recreating on every render
  const formAction = useMemo(
    () =>
      createMessageAction.bind(
        null,
        conversation?.chatbotId ?? "",
        conversation?.id ?? "",
      ),
    [conversation?.chatbotId, conversation?.id],
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    formAction,
    zodResolver(createMessageRequest),
    {
      actionProps: {
        onExecute: ({ input }: { input: Record<string, unknown> }) => {
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
              clientId: input.clientId as string,
            })
          }

          form.reset()
          textareaRef.current?.focus()
        },
        onSuccess: () => {
          textareaRef.current?.focus()
          form.reset()
          form.setValue("clientId", createId())
          form.resetField("attachment")

          // Clear files from upload hook
          setFilesList([])
        },
      },
      formProps: {
        defaultValues: {
          content: "",
          clientId: createId(),
        },
      },
      errorMapProps: {},
    },
  )

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

  // Early return for better readability
  if (!activeConversationId) {
    return null
  }

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
                {inboxConfig ? (
                  <>
                    <inboxConfig.icon
                      aria-hidden="true"
                      className="size-4.5"
                      fill={inboxConfig.color}
                    />
                    <span className="font-medium text-muted-foreground text-sm">
                      {inboxConfig.label}
                    </span>
                  </>
                ) : (
                  <span className="sr-only">No inbox selected</span>
                )}
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
