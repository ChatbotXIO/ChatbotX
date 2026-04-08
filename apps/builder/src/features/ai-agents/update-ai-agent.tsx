"use client"

import { openaiModelOptions } from "@chatbotx.io/ai"
import { aiMessageRoles } from "@chatbotx.io/database/partials"
import type { AIAgentModel } from "@chatbotx.io/database/types"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SliderField } from "@chatbotx.io/ui/components/form/slider-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card } from "@chatbotx.io/ui/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, SlidersHorizontalIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { updateAIAgentAction } from "@/features/ai-agents/actions/update.action"
import { updateAIAgentRequest } from "@/features/ai-agents/schemas/action"
import { AIToolMultiSelect } from "@/features/ai-tools/components/ai-tool-multi-select"
import { geminiModelOptions } from "../integration-gemini/schemas/models"
import type { CreateAIAgentRequest } from "./schemas/action"

export function UpdateAIAgentDialog({
  workspaceId,
  agent,
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  workspaceId: string
  agent: AIAgentModel | null
  onSuccess?: () => void
}) {
  const t = useTranslations()

  const {
    form,
    handleSubmitWithAction,
    form: { setValue, control },
  } = useHookFormAction(
    updateAIAgentAction.bind(null, workspaceId, agent?.id ?? ""),
    zodResolver(updateAIAgentRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.aiAgent.label"),
            }),
          )

          onOpenChange(false)
          onSuccess?.()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
      },
      errorMapProps: {},
    },
  )

  const { fields, append, remove } = useFieldArray({
    control,
    name: "messages",
  })

  const messageRoleOptions = useMemo(
    () => [
      { label: "User", value: aiMessageRoles.enum.user },
      { label: "Assistant", value: aiMessageRoles.enum.assistant },
    ],
    [],
  )

  const addOptions = () => {
    const lastRole: string =
      fields.at(-1)?.role || aiMessageRoles.enum.assistant
    append({
      role:
        lastRole === aiMessageRoles.enum.user
          ? aiMessageRoles.enum.assistant
          : aiMessageRoles.enum.user,
      content: "",
    })
  }

  useEffect(() => {
    if (agent) {
      setValue("name", agent.name)
      setValue("prompt", agent.prompt ?? "")
      setValue("models", agent.models as CreateAIAgentRequest["models"])
      setValue("temperature", agent.temperature)
      setValue("maxOutputTokens", agent.maxOutputTokens)
      setValue("messages", agent.messages as CreateAIAgentRequest["messages"])
      setValue("tools", agent.tools)
    }
  }, [agent, setValue])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.editFeature", { feature: t("fields.aiAgent.label") })}
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

              <Card>
                <div className="flex flex-col gap-4 px-5">
                  <div className="flex items-center">
                    <div className="flex-1 font-medium text-sm">
                      {t("fields.instructions.label")}
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <SlidersHorizontalIcon
                          className="cursor-pointer"
                          size={20}
                        />
                      </PopoverTrigger>
                      <PopoverContent className="flex w-[340px] flex-col gap-6 p-4">
                        <SelectField
                          label={t("fields.geminiModel.label")}
                          name="models.0.model"
                          options={geminiModelOptions}
                          required
                        />

                        <SelectField
                          label={t("fields.model.label")}
                          name="models.1.model"
                          options={openaiModelOptions}
                          required
                        />

                        <SliderField
                          label={t("fields.temperature.label")}
                          max={2}
                          min={0}
                          name="temperature"
                          step={0.1}
                        />

                        <SliderField
                          label={t("fields.maxOutputTokens.label")}
                          max={32_768}
                          min={1}
                          name="maxOutputTokens"
                          step={1}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="rounded-md border border-input">
                    <div className="p-3">
                      <TiptapEditorField name="prompt" />
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex flex-col gap-4 px-5">
                  <div className="font-medium text-sm">
                    {t("fields.prompt.label")}
                  </div>
                  {fields.map((item, index) => (
                    <div
                      className="relative rounded-md border border-input"
                      key={item.id}
                    >
                      <div className="absolute top-3 left-3">
                        <SelectField
                          name={`messages.${index}.role`}
                          options={messageRoleOptions}
                        />
                      </div>
                      <div className="pt-14 pr-3 pb-3 pl-3">
                        <TiptapEditorField name={`messages.${index}.text`} />
                      </div>
                      <Button
                        className="absolute top-0 right-0"
                        onClick={() => remove(index)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <XIcon size={20} />
                      </Button>
                    </div>
                  ))}
                  <div>
                    <Button
                      className="w-full"
                      onClick={addOptions}
                      type="button"
                      variant="outline"
                    >
                      {t("actions.addMore")}
                    </Button>
                  </div>
                </div>
              </Card>
              <AIToolMultiSelect name="tools" />

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
