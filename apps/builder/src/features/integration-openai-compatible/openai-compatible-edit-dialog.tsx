"use client"

import { openaiCompatiblePresetConfigs } from "@chatbotx.io/ai"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PencilIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { updateOpenaiCompatibleAction } from "./actions/update.action"
import {
  buildOpenaiCompatibleModelOptions,
  shouldUseCustomOpenaiCompatibleModelInput,
} from "./model-options"
import { updateOpenaiCompatibleSchema } from "./schemas/request"
import type { IntegrationOpenaiCompatibleResource } from "./schemas/resource"

type OpenaiCompatibleEditDialogProps = {
  integration: IntegrationOpenaiCompatibleResource
  connectedPresets: string[]
}

export function OpenaiCompatibleEditDialog({
  connectedPresets,
  integration,
}: OpenaiCompatibleEditDialogProps) {
  const [open, setOpen] = useState(false)
  const workspaceId = useWorkspaceId()
  const router = useRouter()
  const t = useTranslations()

  const presetOptions = useMemo(
    () =>
      Object.entries(openaiCompatiblePresetConfigs)
        .filter(
          ([value]) =>
            value === "custom" ||
            value === integration.preset ||
            !connectedPresets.includes(value),
        )
        .map(([value, config]) => ({ label: config.label, value })),
    [connectedPresets, integration.preset],
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateOpenaiCompatibleAction.bind(null, workspaceId, integration.id),
    zodResolver(updateOpenaiCompatibleSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(t("messages.updatedSuccess"))
          setOpen(false)
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
          apiKey: "",
          autoReply: integration.autoReply,
          baseURL: integration.baseURL,
          defaultModel: integration.defaultModel,
          enabled: integration.enabled,
          name: integration.name,
          preset: integration.preset,
        },
      },
    },
  )

  const preset = useWatch({ control: form.control, name: "preset" })
  const presetConfig =
    openaiCompatiblePresetConfigs[preset ?? integration.preset]
  const useCustomModelInput =
    shouldUseCustomOpenaiCompatibleModelInput(presetConfig)

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            <PencilIcon className="size-4" />
            {t("actions.edit")}
          </Button>
        }
      />
      <DialogContent className="max-h-screen overflow-y-scroll sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{integration.name}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <SelectField
              label={t("fields.provider.label")}
              name="preset"
              options={presetOptions}
              required
            />
            <InputField label={t("fields.name.label")} name="name" required />
            <InputField
              label={t("openaiCompatible.fields.baseURL")}
              name="baseURL"
              required
            />
            {useCustomModelInput ? (
              <InputField
                label={t("openaiCompatible.fields.defaultModel")}
                name="defaultModel"
                required
              />
            ) : (
              <ComboboxField
                label={t("openaiCompatible.fields.defaultModel")}
                name="defaultModel"
                options={buildOpenaiCompatibleModelOptions(presetConfig)}
                required
              />
            )}
            <InputField
              description={t("openaiCompatible.apiKeyKeepExisting")}
              label={t("fields.apiKey.label")}
              name="apiKey"
              type="password"
            />
            <SwitchField
              formItemClassName="flex flex-row items-center justify-start gap-3 space-y-0"
              label={t("openaiCompatible.autoReply.label")}
              name="autoReply"
              required
            />
            <SwitchField
              formItemClassName="flex flex-row items-center justify-start gap-3 space-y-0"
              label={t("openaiCompatible.fields.enabled")}
              name="enabled"
              required
            />
            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="secondary">
                    {t("actions.cancel")}
                  </Button>
                }
              />
              <Button disabled={form.formState.isSubmitting} type="submit">
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
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
