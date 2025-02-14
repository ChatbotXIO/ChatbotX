"use client"

import { FormInput } from "@/components/form-input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { OpenAIMessageRole } from "@/features/integration-openai/schemas"
import { updateAIAgentAction } from "@/features/integrations/ai-agents/actions/update.action"
import {
  type MessageSchema,
  updateAIAgentSchema,
} from "@/features/integrations/ai-agents/schemas/update.schema"
import type { AIAgent } from "@ahachat.ai/database"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"

export function UpdateAIAgentDialog({
  chatbotId,
  agent,
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  agent: AIAgent | null
}) {
  const { t } = useTranslate()
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    form: { setValue, control, reset },
  } = useHookFormAction(
    updateAIAgentAction.bind(null, chatbotId, agent?.id ?? ""),
    zodResolver(updateAIAgentSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("AI Agent update successfully")

          onOpenChange(false)
          router.refresh()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError.message ?? error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
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
      setValue("name", agent.name)
      setValue("prompt", agent.prompt || "")
      if (agent.messages.length) {
        setValue("messages", (agent?.messages as MessageSchema[]) ?? [])
      }
    }
  }, [agent, setValue])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("aiAgents.update.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              onSubmit={handleSubmitWithAction}
              className="flex-1 space-y-4"
            >
              <FormInput name="name" label={t("aiAgent.name")} />

              <FormInput
                name="prompt"
                label={t("aiAgent.prompt")}
                inputType="textarea"
              />

              <div className="flex flex-col space-y-2 overflow-auto max-h-[300px]">
                {fields.map((item, index) => (
                  <div className="flex items-center space-x-2" key={item.id}>
                    <div className="w-[100px]">
                      <FormInput name={`messages.${index}.role`} label="">
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-[100px] capitalize"
                          onClick={() => onChangeRole(index)}
                        >
                          {item.role}
                        </Button>
                      </FormInput>
                    </div>
                    <div className="w-[calc(100%-160px)]">
                      <FormInput name={`messages.${index}.content`} label="" />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="w-[60px]"
                      onClick={() => remove(index)}
                    >
                      <XIcon size={20} />
                    </Button>
                  </div>
                ))}
              </div>

              <div>
                <Button type="button" onClick={addOptions}>
                  {t("common.add-more")}
                </Button>
              </div>

              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                >
                  {t("common.cancel-btn")}
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                >
                  {form.formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("common.confirm-btn")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
