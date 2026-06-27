"use client"

import { aiChatProviders } from "@chatbotx.io/ai"
import {
  type AIAgentProviderModels,
  aiMessageRoles,
} from "@chatbotx.io/database/partials"
import type { AIAgentModel } from "@chatbotx.io/database/types"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SliderField } from "@chatbotx.io/ui/components/form/slider-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
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
import { useEffect, useMemo } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { updateAIAgentAction } from "@/features/ai-agents/actions/update.action"
import {
  type UpdateAIAgentRequest,
  updateAIAgentRequest,
} from "@/features/ai-agents/schemas/action"
import { AIToolMultiSelect } from "@/features/ai-tools/components/ai-tool-multi-select"
import { WebSearchAuthorizedDomainsField } from "./components/web-search-authorized-domains-field"

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
      // Normalize stored models to the full ordered provider list so agents
      // created before a provider existed still render every selector with a
      // sensible default (missing providers fall back to their default model).
      const storedModels = (agent.models ?? []) as AIAgentProviderModels
      const normalizedModels = aiChatProviders.map((provider) => ({
        provider: provider.provider,
        model:
          storedModels.find((m) => m.provider === provider.provider)?.model ??
          provider.defaultModel,
      }))

      setValue("name", agent.name)
      setValue("prompt", agent.prompt ?? "")
      setValue("models", normalizedModels as UpdateAIAgentRequest["models"])
      setValue("temperature", agent.temperature)
      setValue("maxOutputTokens", agent.maxOutputTokens)
      setValue("messages", agent.messages as UpdateAIAgentRequest["messages"])
      setValue("tools", agent.tools)
      setValue("isRichResponse", agent.isRichResponse)
      setValue(
        "webSearchAuthorizedDomains",
        agent.webSearchAuthorizedDomains.map((domain) => ({ value: domain })),
      )
    }
  }, [agent, setValue])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen overflow-y-scroll lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {t("messages.editFeature", { feature: t("fields.aiAgent.label") })}
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
                    {aiChatProviders.map((provider, index) => (
                      <SelectField
                        key={provider.provider}
                        label={`${t(`aiProviders.${provider.provider}`)} ${t("fields.model.label")}`}
                        name={`models.${index}.model`}
                        options={provider.modelOptions}
                        required
                      />
                    ))}

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
            <WebSearchAuthorizedDomainsField />
            <div>
              <div className="flex items-center gap-3">
                <Label>{t("fields.isRichResponse.label")}</Label>
                <SwitchField formItemClassName="w-auto" name="isRichResponse" />
              </div>
              <p className="wrap-break-words mt-1.5 text-muted-foreground text-sm">
                {t("fields.isRichResponse.description")}
              </p>
            </div>

            <DialogFooter className="justify-end gap-2 sm:gap-2">
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  (!form.formState.isValid &&
                    (form.formState.isDirty || form.formState.isSubmitted)) ||
                  form.formState.isSubmitting
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
