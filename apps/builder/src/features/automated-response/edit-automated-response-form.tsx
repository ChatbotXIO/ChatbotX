"use client"

import type { AutomatedResponseModel } from "@chatbotx.io/database/types"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form, FormMessage } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusCircleIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { useFlowSelectOptions } from "../flows/provider/flow-hook"
import { updateAutomatedResponseAction } from "./actions/update-automated-response-action"
import { updateAutomatedResponseRequest } from "./schema/action"

type EditAutomatedResponseFormProps = {
  workspaceId: string
  automatedResponse: AutomatedResponseModel
}

export default function EditAutomatedResponseForm(
  props: EditAutomatedResponseFormProps,
) {
  const { workspaceId, automatedResponse } = props
  const t = useTranslations()
  const router = useRouter()

  const _flowOptions = useFlowSelectOptions()

  const {
    form,
    handleSubmitWithAction,
    form: { control },
  } = useHookFormAction(
    updateAutomatedResponseAction.bind(null, workspaceId, automatedResponse.id),
    zodResolver(updateAutomatedResponseRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.automatedResponse.label"),
            }),
          )
          router.back()
          setTimeout(() => router.refresh())
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
          userMessages: [{ value: "" }],
          text: "",
          flowId: null,
        },
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    if (automatedResponse) {
      form.reset({
        ...automatedResponse,
        text: automatedResponse.text,
        flowId: automatedResponse.flowId,
        userMessages:
          automatedResponse.userMessages?.map((m) => ({ value: m })) ?? [],
      })
    }
  }, [automatedResponse, form])

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
              type="button"
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
        {/* {replies.map((reply, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: wip
          <div className="flex w-full gap-2" key={index}>
            <div className="flex w-1/2 items-center gap-2">
              {reply.type === replyTypes.enum.text ? (
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
              type="button"
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
                type: replyTypes.enum.text,
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
                type: replyTypes.enum.flow,
                flowId: "",
              })
            }}
            type="button"
            variant="ghost"
          >
            <PlusCircleIcon /> {t("actions.addFlowReply")}
          </Button>
        </div> */}
        <div className="flex justify-end gap-4">
          <Button onClick={() => router.back()} type="button" variant="ghost">
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
