"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { useIsTouchDevice } from "@chatbotx.io/ui/hooks/use-touch-device"
import { createId } from "@chatbotx.io/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { PaperclipIcon, SendHorizonalIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type KeyboardEvent, useEffect, useMemo, useRef } from "react"
import { Controller, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { shouldSendOnEnter } from "@/lib/keyboard/should-send-on-enter"
import { createWebchatMessageAction } from "../messages/actions/create-webchat-message.action"
import EmojiPicker from "../messages/components/emoji-picker"
import { FileUploadPreview } from "../messages/components/file-upload"
import { flattenValidationErrors } from "../messages/lib/validation-errors"
import { createWebchatMessageRequest } from "../messages/schema/mutation"
import { getWebchatProfileFields } from "./browser-profile-fields"
import WebchatMessageMenu from "./components/webchat-message-menu"
import { useGuestSessionStore } from "./providers/store/guest-session-provider"

type WebchatMessageInputProps = {
  workspaceId: string
  webchatId: string
  referral?: string | undefined
  parentOrigin?: string | null
  accessToken?: string | null
}

export const WebchatMessageInput = (props: WebchatMessageInputProps) => {
  const {
    workspaceId,
    webchatId,
    referral = "",
    parentOrigin,
    accessToken,
  } = props
  const { sendMessage, guestConversationId, appendMessage, markMessageFailed } =
    useGuestSessionStore((state) => state)

  const t = useTranslations()
  const isTouchDevice = useIsTouchDevice()

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const defaultValues = useMemo(
    () => ({
      text: "",
      files: [],
      workspaceId,
      webchatId,
      guestConversationId: guestConversationId ?? "",
      ref: referral,
      ...getWebchatProfileFields(),
      accessToken: accessToken ?? undefined,
      parentOrigin: parentOrigin ?? undefined,
    }),
    [
      workspaceId,
      webchatId,
      guestConversationId,
      referral,
      parentOrigin,
      accessToken,
    ],
  )

  const {
    form,
    action,
    form: { control, setValue },
  } = useHookFormAction(
    createWebchatMessageAction,
    zodResolver(createWebchatMessageRequest),
    {
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
  const content = useWatch({ control, name: "text" })

  useEffect(() => {
    if (files.length > 0) {
      setValue("text", "")
    }
  }, [files, setValue])

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

    form.setValue("text", newText)
  }

  const fileUploadRef = useRef(null)
  const onClickAttachment = () => {
    if (fileUploadRef.current) {
      // biome-ignore lint/suspicious/noExplicitAny: wip
      ;(fileUploadRef.current as any).openFileDialog() // Trigger the file dialog
    }
  }

  const submitMessage = async () => {
    const clientId = createId()
    const submittedFiles = form.getValues("files")
    const values = {
      ...form.getValues(),
      clientId,
    }
    const parsed = createWebchatMessageRequest.safeParse(values)
    if (!parsed.success) {
      await form.trigger()
      return
    }

    if ("text" in parsed.data && parsed.data.text) {
      sendMessage(parsed.data.text, clientId)
    }
    setValue("text", "")
    textareaRef.current?.focus()

    try {
      const result = await action.executeAsync(parsed.data)
      if (result?.serverError) {
        markMessageFailed(clientId, result.serverError)
        toast.error(result.serverError)
        return
      }

      if (result?.validationErrors) {
        const validationErrors = flattenValidationErrors(
          result.validationErrors,
        )
        for (const validationError of validationErrors) {
          form.setError(validationError.path as never, {
            message: validationError.message,
          })
        }
        const errorMessage =
          validationErrors[0]?.message ?? t("messages.unknownError")
        markMessageFailed(clientId, errorMessage)
        toast.error(errorMessage)
        return
      }

      if (result?.data?.attachments?.length) {
        appendMessage(result.data)
      }
      if (form.getValues("files") === submittedFiles) {
        setValue("files", [])
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : t("messages.unknownError")
      markMessageFailed(clientId, errorMessage)
      toast.error(errorMessage)
    }
  }

  const onKeyDown = async (e: KeyboardEvent) => {
    if (files.length > 0 || !shouldSendOnEnter(e, isTouchDevice)) {
      return
    }

    e.preventDefault()
    await submitMessage()
  }

  return (
    <div className="m-3 rounded-xl border pt-2">
      <Form {...form}>
        <form
          className="flex w-full flex-col"
          onSubmit={async (event) => {
            event.preventDefault()
            await submitMessage()
          }}
        >
          {files.length === 0 && (
            <div className="mb-1 w-full px-2.5 py-1">
              <Controller
                control={form.control}
                name="text"
                render={({ field }) => (
                  <Textarea
                    autoComplete="off"
                    className="h-16 resize-none border-0 px-1.5 py-0 shadow-none focus:ring-0 focus-visible:ring-0"
                    disabled={files.length > 0}
                    enterKeyHint={isTouchDevice ? "enter" : "send"}
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
          <div className="flex w-full items-center ps-2.5">
            <div className="flex-1">
              <WebchatMessageMenu
                accessToken={accessToken}
                parentOrigin={parentOrigin}
                webchatId={webchatId}
                workspaceId={workspaceId}
              />
            </div>
            <div className="message-toolbar flex items-center">
              {!content && (
                <Button
                  className="px-2 py-1.5 [&_svg]:size-5"
                  disabled={!workspaceId}
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
                  !(workspaceId && form.formState.isValid) ||
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
