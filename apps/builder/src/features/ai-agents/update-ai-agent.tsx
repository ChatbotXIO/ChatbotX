"use client"

import type { AIAgentModel } from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { updateAIAgentAction } from "@/features/ai-agents/actions/update.action"
import {
  type MessageSchema,
  updateAIAgentRequest,
} from "@/features/ai-agents/schemas/update.schema"
import { OpenAIMessageRole } from "@/features/integration-openai/schemas"

export function UpdateAIAgentDialog({
  chatbotId,
  agent,
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  agent: AIAgentModel | null
}) {
  const t = useTranslations()
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    form: { reset, control },
  } = useHookFormAction(
    updateAIAgentAction.bind(null, chatbotId, agent?.id ?? ""),
    zodResolver(updateAIAgentRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccessfully", {
              feature: t("fields.aiAgent.label"),
            }),
          )

          onOpenChange(false)
          router.refresh()
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
          prompt: "",
        },
      },
      errorMapProps: {},
    },
  )

  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "messages",
  })

  const onChangeRole = (index: number) => {
    update(index, {
      role:
        fields[index]?.role === OpenAIMessageRole.User
          ? OpenAIMessageRole.Assistant
          : OpenAIMessageRole.User,
      content: "",
    })
  }

  const addOptions = () => {
    const lastRole: string = fields.at(-1)?.role || OpenAIMessageRole.Assistant
    append({
      role:
        lastRole === OpenAIMessageRole.User
          ? OpenAIMessageRole.Assistant
          : OpenAIMessageRole.User,
      content: "",
    })
  }

  useEffect(() => {
    if (agent) {
      const { messages, ...rest } = agent
      reset({
        ...rest,
        messages: agent?.messages as MessageSchema[],
      })
    }
  }, [agent, reset])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className={"max-h-screen overflow-y-scroll lg:max-w-screen-lg"}
      >
        <DialogHeader>
          <DialogTitle>
            {t("dialog.updateTitle", { feature: t("fields.aiAgent.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <InputField label={t("fields.name.label")} name="name" />

              <TextareaField label={t("fields.prompt.label")} name="prompt" />

              <div className="flex max-h-[300px] flex-col space-y-2 overflow-auto">
                {fields.map((item, index) => (
                  <div className="flex items-center space-x-2" key={item.id}>
                    <div className="w-[100px]">
                      <InputField name={`messages.${index}.role`} />
                      <Button
                        className="w-[100px] capitalize"
                        onClick={() => onChangeRole(index)}
                        type="button"
                        variant="secondary"
                      >
                        {item.role}
                      </Button>
                    </div>
                    <div className="w-[calc(100%-160px)]">
                      <InputField name={`messages.${index}.content`} />
                    </div>
                    <Button
                      className="w-[60px]"
                      onClick={() => remove(index)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <XIcon size={20} />
                    </Button>
                  </div>
                ))}
              </div>

              <div>
                <Button onClick={addOptions} type="button">
                  {t("actions.add")}
                </Button>
              </div>

              <div className="flex justify-end gap-4">
                <Button
                  onClick={() => onOpenChange(false)}
                  type="button"
                  variant="ghost"
                >
                  {t("actions.cancel")}
                </Button>
                <Button
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
