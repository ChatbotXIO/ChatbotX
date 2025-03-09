"use client"

import { FormInput } from "@/components/form-input"
import { Button } from "@/components/ui/button"
import { Form, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon, PlusCircleIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { Controller, useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { FlowSelect } from "../flows/flow-select"
import { createAutomatedResponseAction } from "./actions/create-automated-response-action"
import {
  createAutomatedResponseRequest,
  ReplyType,
} from "./schemas/create-automated-responses-schema"

export function CreateAutomatedResponseForm({
  chatbotId,
  folderId,
}: {
  chatbotId: string
  folderId: string | null
}) {
  const { t } = useTranslate()
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
          error.serverError && toast.error(error.serverError)
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
      <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">
        <Controller
          name="userMessages"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor="userMessages" className="flex-1">
                User message
              </Label>
              {/* Render existing inputs */}
              {field.value.map((m, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                <div key={index} className="flex gap-2">
                  <Input
                    className="flex-1"
                    value={m}
                    onChange={(e) => {
                      const userMessages = [...field.value]
                      userMessages[index] = e.target.value
                      field.onChange(userMessages)
                    }}
                  />
                  {index === 0 ? (
                    <div className="w-12">&nbsp;</div>
                  ) : (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        const newTags = field.value.filter(
                          (_, i) => i !== index,
                        ) // Remove the input
                        field.onChange(newTags)
                      }}
                    >
                      <XIcon />
                    </Button>
                  )}
                </div>
              ))}
              <FormMessage />
              <div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    field.onChange([...field.value, ""])
                  }}
                >
                  <PlusCircleIcon /> Add more
                </Button>
              </div>
            </div>
          )}
        />

        {/* Bot response block */}
        <div className="mt-4">
          <Label htmlFor="replies.0" className="font-bold mt-5">
            Bot response
          </Label>
        </div>

        {replies.map((reply, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
          <div key={index} className="flex gap-2 w-full">
            <div className="flex-1">
              {reply.type === ReplyType.MESSAGE ? (
                <FormInput
                  name={`replies.${index}.message`}
                  label=""
                  placeholder="Type a message"
                  isRequired={false}
                />
              ) : (
                <FlowSelect name={`replies.${index}.flowId`} label="" />
              )}
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                removeReplies(index)
              }}
            >
              <XIcon />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() =>
              appendReplies({
                type: ReplyType.MESSAGE,
                message: "",
                buttons: [],
              })
            }
          >
            <PlusCircleIcon /> Add text reply
          </Button>

          <Button
            variant="ghost"
            onClick={() =>
              appendReplies({
                type: ReplyType.FLOW,
                flowId: "",
              })
            }
          >
            <PlusCircleIcon /> Add flow reply
          </Button>
        </div>

        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              router.push(`/chatbots/${chatbotId}/automated-responses`)
            }
          >
            {t("common.cancel-btn")}
          </Button>
          <Button
            type="submit"
            disabled={!form.formState.isValid || form.formState.isSubmitting}
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("common.confirm-btn")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
