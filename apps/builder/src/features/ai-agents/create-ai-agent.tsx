"use client"

import {
  aiProviders,
  geminiModels,
  openaiModelOptions,
  openaiModels,
} from "@chatbotx.io/ai"
import { aiMessageRoles } from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SliderField } from "@chatbotx.io/ui/components/form/slider-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import {
  Loader2Icon,
  PlusIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { createAIAgentAction } from "@/features/ai-agents/actions/create.action"
import { createAIAgentRequest } from "@/features/ai-agents/schemas/action"
import { AIToolMultiSelect } from "@/features/ai-tools/components/ai-tool-multi-select"
import { geminiModelOptions } from "../integration-gemini/schemas/models"

type CreateAIAgentDialogProps = {
  workspaceId: string
  onSuccess?: () => void
}

export function CreateAIAgentDialog({
  workspaceId,
  onSuccess,
}: CreateAIAgentDialogProps) {
  const [open, setOpen] = useState(false)

  const t = useTranslations()

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { control },
  } = useHookFormAction(
    createAIAgentAction.bind(null, workspaceId),
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
              provider: aiProviders.enum.gemini,
              model: geminiModels.enum["gemini-2.5-pro"],
            },
            {
              provider: aiProviders.enum.openai,
              model: openaiModels.enum["gpt-4o-mini"],
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

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t("actions.createFeature", { feature: t("fields.aiAgent.label") })}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-screen overflow-y-scroll lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {t("messages.createFeature", {
              feature: t("fields.aiAgent.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-1 flex-col space-y-6"
            onSubmit={handleSubmitWithAction}
          >
            <InputField label={t("fields.name.label")} name="name" required />

            <div>
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1 font-medium text-sm">
                  {t("fields.instructions.label")}
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      aria-label={t("actions.moreSettings")}
                      className="shrink-0"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <SlidersHorizontalIcon aria-hidden className="size-4" />
                    </Button>
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

              <TiptapEditorField name="prompt" />
            </div>

            <div className="flex flex-col gap-3">
              <div className="font-medium text-sm">
                {t("fields.messages.label")}
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
                  <div className="pt-14 pr-12 pb-3 pl-3">
                    <TiptapEditorField name={`messages.${index}.content`} />
                  </div>
                  <Button
                    aria-label={t("actions.delete")}
                    className="absolute top-1 right-1"
                    onClick={() => remove(index)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <XIcon aria-hidden size={20} />
                  </Button>
                </div>
              ))}

              <Button
                className="w-28"
                onClick={addOptions}
                size="sm"
                type="button"
                variant="outline"
              >
                <PlusIcon aria-hidden />
                {t("actions.addMore")}
              </Button>
            </div>

            <AIToolMultiSelect name="tools" />

            <DialogFooter className="justify-end gap-2 sm:gap-2">
              <Button
                onClick={() => setOpen(false)}
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
                  <Loader2Icon aria-hidden className="animate-spin" />
                )}
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
