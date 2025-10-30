"use client"

import { ReplyType } from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form, FormMessage } from "@aha.chat/ui/components/ui/form"
import { Input } from "@aha.chat/ui/components/ui/input"
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
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Controller, useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { FlowSelect } from "../flows/flow-select"
import { createAutomatedResponseAction } from "./actions/create-automated-response-action"
import { createAutomatedResponseRequest } from "./schemas/create-automated-responses-schema"

export function CreateAutomatedResponseForm({
  chatbotId,
  folderId,
}: {
  chatbotId: string
  folderId: string | null
}) {
  const t = useTranslations()
  const router = useRouter()

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
          toast.success("Automated Response created successfully")
          router.push(`/chatbots/${chatbotId}/automated-responses`)
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
          userMessages: [""],
          replies: [],
        },
      },
      errorMapProps: {},
    },
  )

  const {
    fields: replies,
    append: appendReplies,
    remove: removeReplies,
  } = useFieldArray({
    control,
    name: "replies",
  })

  return (
    <Form {...form}>
      <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
        <Controller
          control={control}
          name="userMessages"
          render={({ field }) => (
            <div className="flex flex-col gap-2">
              <Label className="flex-1" htmlFor="userMessages">
                {t("fields.userMessage.label")}
              </Label>
              {/* Render existing inputs */}
              {field.value.map((m, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: wip
                <div className="flex gap-2" key={index}>
                  <Input
                    className="flex-1"
                    onChange={(e) => {
                      const userMessages = [...field.value]
                      userMessages[index] = e.target.value
                      field.onChange(userMessages)
                    }}
                    value={m}
                  />
                  {index === 0 ? (
                    <div className="w-12">&nbsp;</div>
                  ) : (
                    <Button
                      onClick={() => {
                        const newTags = field.value.filter(
                          (_, i) => i !== index,
                        ) // Remove the input
                        field.onChange(newTags)
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
                    field.onChange([...field.value, ""])
                  }}
                  variant="ghost"
                >
                  <PlusCircleIcon /> {t("actions.addMore")}
                </Button>
              </div>
            </div>
          )}
        />

        {/* Bot response block */}
        <div className="mt-4">
          <Label className="mt-5 font-bold" htmlFor="replies.0">
            {t("fields.botResponse.label")}
          </Label>
        </div>

        {replies.map((reply, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: wip
          <div className="flex w-full gap-2" key={index}>
            <div className="flex flex-1 items-center gap-2">
              {reply.type === ReplyType.Message ? (
                <>
                  <MessageSquareMoreIcon />
                  <InputField
                    className="flex-1"
                    name={`replies.${index}.message`}
                    placeholder="Type a message"
                  />
                </>
              ) : (
                <>
                  <ZapIcon />
                  <FlowSelect
                    className="flex-1"
                    name={`replies.${index}.flowId`}
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
