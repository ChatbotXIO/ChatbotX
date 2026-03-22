"use client"

import { ReplyType } from "@aha.chat/database/types"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form, FormMessage } from "@aha.chat/ui/components/ui/form"
import { Label } from "@aha.chat/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import {
  Loader2Icon,
  MessageSquareMoreIcon,
  PlusCircleIcon,
  XIcon,
  ZapIcon,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { useFlowSelectOptions } from "../flows/provider/flow-hook"
import { createAutomatedResponseAction } from "./actions/create-automated-response-action"
import { createAutomatedResponseRequest } from "./schemas/action"

type CreateAutomatedResponseFormProps = {
  chatbotId: string
  folderId: string | null
}

export function CreateAutomatedResponseForm(
  props: CreateAutomatedResponseFormProps,
) {
  const { chatbotId, folderId } = props

  const searchParams = useSearchParams()

  const t = useTranslations()
  const router = useRouter()

  const flowOptions = useFlowSelectOptions()

  const {
    form,
    handleSubmitWithAction,
    form: { control },
  } = useHookFormAction(
    createAutomatedResponseAction.bind(null, chatbotId),
    zodResolver(createAutomatedResponseRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.automatedResponse.label"),
            }),
          )
          router.push(
            `/chatbots/${chatbotId}/automated-responses?${searchParams.toString()}`,
          )
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          folderId: folderId ?? null,
          userMessages: [{ value: "" }],
          replies: [],
        },
      },
      errorMapProps: {},
    },
  )

  const { setValue } = form
  useEffect(() => {
    if (folderId) {
      setValue("folderId", folderId)
    }
  }, [setValue, folderId])

  const {
    fields: replies,
    append: appendReplies,
    remove: removeReplies,
  } = useFieldArray({
    control,
    name: "replies",
  })

  const {
    fields: userMessages,
    append: appendUserMessages,
    remove: removeUserMessages,
  } = useFieldArray({
    control,
    name: "userMessages",
  })

  return (
    <Form {...form}>
      <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
        <div className="flex flex-col gap-2">
          <Label className="flex-1" htmlFor="userMessages">
            {t("fields.userMessage.label")}
          </Label>

          {userMessages.map((_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: wip
            <div className="flex gap-2" key={index}>
              <InputField
                formItemClassName="w-1/2"
                name={`userMessages.${index}.value`}
              />
              {index === 0 ? (
                <div className="w-12">&nbsp;</div>
              ) : (
                <Button
                  onClick={() => {
                    removeUserMessages(index)
                  }}
                  variant="ghost"
                >
                  <XIcon />
                </Button>
              )}
            </div>
          ))}
          <FormMessage />
          <div>
            <Button
              onClick={() => {
                appendUserMessages({ value: "" })
              }}
              variant="ghost"
            >
              <PlusCircleIcon /> {t("actions.addMore")}
            </Button>
          </div>
        </div>

        {/* Bot response block */}
        <div className="mt-4">
          <Label className="mt-5 font-bold" htmlFor="replies.0">
            {t("fields.botResponse.label")}
          </Label>
        </div>

        {replies.map((reply, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: wip
          <div className="flex w-full gap-2" key={index}>
            <div className="flex w-1/2 items-start gap-2">
              {reply.type === ReplyType.Message ? (
                <>
                  <MessageSquareMoreIcon className="mt-1.5" />
                  <InputField
                    className="flex-1"
                    name={`replies.${index}.message`}
                    placeholder="Type a message"
                  />
                </>
              ) : (
                <>
                  <ZapIcon />
                  <ComboboxField
                    className="flex-1"
                    name={`replies.${index}.flowId`}
                    options={flowOptions}
                    placeholder="Please select flow"
                    required={true}
                  />
                </>
              )}
            </div>
            <Button
              onClick={() => {
                removeReplies(index)
              }}
              variant="ghost"
            >
              <XIcon />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button
            onClick={(e) => {
              e.preventDefault()
              appendReplies({
                type: ReplyType.Message,
                message: "",
                buttons: [],
              })
            }}
            type="button"
            variant="ghost"
          >
            <PlusCircleIcon /> {t("actions.addTextReply")}
          </Button>

          <Button
            onClick={(e) => {
              e.preventDefault()
              appendReplies({
                type: ReplyType.Flow,
                flowId: "",
              })
            }}
            type="button"
            variant="ghost"
          >
            <PlusCircleIcon /> {t("actions.addFlowReply")}
          </Button>
        </div>

        <div className="flex justify-end gap-4">
          <Button
            onClick={() =>
              router.push(`/chatbots/${chatbotId}/automated-responses`)
            }
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("actions.confirm")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
