"use client"

import {
  type AIFileModel,
  type AIFunctionModel,
  type AIMCPServerModel,
  AIMessageRole,
} from "@aha.chat/database/types"
import { aiProviders, defaultAIModelIds } from "@aha.chat/flow-config"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { SliderField } from "@aha.chat/ui/components/form/slider-field"
import { SwitchField } from "@aha.chat/ui/components/form/switch-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@aha.chat/ui/components/ui/collapsible"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import {
  FileIcon,
  FunctionSquareIcon,
  Loader2Icon,
  MoveRightIcon,
  PlusIcon,
  ServerIcon,
  TrashIcon,
} from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { createAIAgentAction } from "@/features/ai-agents/actions/create.action"
import { createAIAgentRequest } from "@/features/ai-agents/schemas/action"
import { geminiModelOptions } from "../integration-gemini/schemas/models"
import { openaiChatModelOptions } from "../openai/models"

type CreateAIAgentDialogProps = {
  files: AIFileModel[]
  functions: AIFunctionModel[]
  mcpServers: AIMCPServerModel[]
  onSuccess?: () => void
}

export function CreateAIAgentDialog({
  files,
  functions,
  mcpServers,
  onSuccess,
}: CreateAIAgentDialogProps) {
  const [open, setOpen] = useState(false)
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const t = useTranslations()

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

  const messageRoleOptions = useMemo(
    () => [
      { label: "User", value: AIMessageRole.user },
      { label: "Assistant", value: AIMessageRole.assistant },
    ],
    [],
  )

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createAIAgentAction.bind(null, chatbotId),
      zodResolver(createAIAgentRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.createdSuccess", {
                feature: t("fields.aiAgent.label"),
              }),
            )

            setOpen(false)
            resetFormAndAction()
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
          defaultValues: {
            name: "",
            prompt: "",
            isDefault: false,
            messages: [],
            models: [
              {
                provider: aiProviders.gemini,
                model: defaultAIModelIds.gemini,
              },
              {
                provider: aiProviders.openai,
                model: defaultAIModelIds.openai,
              },
            ],
            temperature: 0.4,
            maxOutputTokens: 2048,
            tools: [],
          },
        },
        errorMapProps: {},
      },
    )

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "messages",
  })

  const addMessage = () => {
    append({
      role: AIMessageRole.user,
      content: "",
    })
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t("actions.createFeature", { feature: t("fields.aiAgent.label") })}
        </Button>
      </DialogTrigger>
      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.createFeature", {
              feature: t("fields.aiAgent.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-6"
              onSubmit={handleSubmitWithAction}
            >
              <InputField label={t("fields.name.label")} name="name" required />

              <TextareaField
                label={t("fields.prompt.label")}
                name="prompt"
                required
              />

              <div className="flex flex-col items-start gap-2">
                <div className="font-medium text-sm">
                  {t("fields.prompt.label")}
                </div>
                {fields.map((field, index) => (
                  <div className="flex w-full items-start gap-2" key={field.id}>
                    <div className="flex-0 shrink-0 basis-[110px]">
                      <SelectField
                        name={`messages.${index}.role`}
                        options={messageRoleOptions}
                      />
                    </div>
                    <TextareaField
                      className="flex-1"
                      name={`messages.${index}.content`}
                    />
                    <Button
                      onClick={() => remove(index)}
                      type="button"
                      variant="secondary"
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                ))}
                <Button onClick={addMessage} type="button" variant="secondary">
                  <PlusIcon />
                  {t("actions.addMore")}
                </Button>
              </div>

              <MultiSelectField
                label={t("fields.tools.label")}
                name="tools"
                options={toolOptions}
              />

              <SwitchField
                label={t("fields.isDefault.label")}
                name="isDefault"
              />

              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center justify-start gap-4 text-destructive">
                  {t("actions.moreSettings")}
                  <MoveRightIcon />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-6">
                  <div className="mt-4" />
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
                </CollapsibleContent>
              </Collapsible>

              <DialogFooter className="justify-end">
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    {t("actions.cancel")}
                  </Button>
                </DialogClose>
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
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
