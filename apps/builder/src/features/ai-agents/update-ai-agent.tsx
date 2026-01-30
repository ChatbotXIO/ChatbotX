"use client"

import {
  type AIAgentModel,
  type AIFileModel,
  type AIFunctionModel,
  type AIMCPServerModel,
  AIMessageRole,
} from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { SliderField } from "@aha.chat/ui/components/form/slider-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card } from "@aha.chat/ui/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import {
  FileIcon,
  FunctionSquareIcon,
  Loader2Icon,
  ServerIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { updateAIAgentAction } from "@/features/ai-agents/actions/update.action"
import { updateAIAgentRequest } from "@/features/ai-agents/schemas/request"
import { geminiModelOptions } from "../integration-gemini/schemas/models"
import { openaiChatModelOptions } from "../openai/models"
import type { CreateAIAgentRequest } from "./schemas/request"

export function UpdateAIAgentDialog({
  chatbotId,
  agent,
  open,
  files,
  functions,
  mcpServers,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  agent: AIAgentModel | null
  onSuccess?: () => void
  files: AIFileModel[]
  functions: AIFunctionModel[]
  mcpServers: AIMCPServerModel[]
}) {
  const t = useTranslations()

  const {
    form,
    handleSubmitWithAction,
    form: { setValue, control },
  } = useHookFormAction(
    updateAIAgentAction.bind(null, chatbotId, agent?.id ?? ""),
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
      { label: "User", value: AIMessageRole.user },
      { label: "Assistant", value: AIMessageRole.assistant },
    ],
    [],
  )

  const toolOptions = useMemo(
    () => [
      {
        heading: t("fields.file.label"),
        options: files.map((file) => ({
          label: file.name,
          value: `file:${file.id}`,
          icon: FileIcon,
        })),
      },
      {
        heading: t("fields.function.label"),
        options: functions.map((fn) => ({
          label: fn.name,
          value: `fn:${fn.id}`,
          icon: FunctionSquareIcon,
        })),
      },
      {
        heading: t("fields.mcpServer.label"),
        options: mcpServers.map((mcpServer) => ({
          label: mcpServer.name,
          value: `mcp:${mcpServer.id}`,
          icon: ServerIcon,
        })),
      },
    ],
    [files, functions, mcpServers, t],
  )

  const addOptions = () => {
    const lastRole: string = fields.at(-1)?.role || AIMessageRole.assistant
    append({
      role:
        lastRole === AIMessageRole.user
          ? AIMessageRole.assistant
          : AIMessageRole.user,
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
                          options={openaiChatModelOptions}
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
                        <TiptapEditorField name={`messages.${index}.content`} />
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
              <MultiSelectField
                label={t("fields.tools.label")}
                name="tools"
                options={toolOptions}
              />

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
