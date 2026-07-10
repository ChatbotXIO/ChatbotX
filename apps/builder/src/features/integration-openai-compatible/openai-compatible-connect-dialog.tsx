"use client"

import {
  type OpenaiCompatibleProviderPreset,
  openaiCompatiblePresetConfigs,
} from "@chatbotx.io/ai"
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
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { connectOpenaiCompatibleAction } from "./actions/connect.action"
import {
  buildOpenaiCompatibleModelOptions,
  shouldUseCustomOpenaiCompatibleModelInput,
} from "./model-options"
import { connectOpenaiCompatibleSchema } from "./schemas/request"

type OpenaiCompatibleConnectDialogProps = {
  connectedPresets: string[]
}

export function OpenaiCompatibleConnectDialog({
  connectedPresets,
}: OpenaiCompatibleConnectDialogProps) {
  const [open, setOpen] = useState(false)
  const workspaceId = useWorkspaceId()
  const router = useRouter()
  const t = useTranslations()

  const connectedPresetSet = useMemo(
    () => new Set(connectedPresets.filter((preset) => preset !== "custom")),
    [connectedPresets],
  )

  const presetOptions = useMemo(
    () =>
      Object.entries(openaiCompatiblePresetConfigs)
        .filter(([value]) => !connectedPresetSet.has(value))
        .map(([value, config]) => ({
          label: config.label,
          value,
        })),
    [connectedPresetSet],
  )

  const presetOptionValues = useMemo(
    () => new Set(presetOptions.map((option) => option.value)),
    [presetOptions],
  )

  const fallbackPreset = (presetOptions[0]?.value ??
    "custom") as OpenaiCompatibleProviderPreset

  const { form, handleSubmitWithAction } = useHookFormAction(
    connectOpenaiCompatibleAction.bind(null, workspaceId),
    zodResolver(connectOpenaiCompatibleSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.connectedSuccess", {
              feature: t("openaiCompatible.provider"),
            }),
          )
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
          autoReply: false,
          baseURL: "",
          defaultModel: "",
          enabled: true,
          name: "",
          preset: fallbackPreset,
        },
      },
    },
  )

  const preset = useWatch({ control: form.control, name: "preset" })
  const selectedPreset =
    preset && presetOptionValues.has(preset)
      ? (preset as OpenaiCompatibleProviderPreset)
      : fallbackPreset
  const selectedPresetConfig = openaiCompatiblePresetConfigs[selectedPreset]
  const useCustomModelInput =
    shouldUseCustomOpenaiCompatibleModelInput(selectedPresetConfig)

  useEffect(() => {
    if (preset !== selectedPreset) {
      form.setValue("preset", selectedPreset, { shouldValidate: true })
    }

    const config = openaiCompatiblePresetConfigs[selectedPreset]
    if (!config) {
      return
    }
    form.setValue("name", config.label, { shouldValidate: true })
    form.setValue("baseURL", config.defaultBaseURL, { shouldValidate: true })
    form.setValue("defaultModel", config.defaultModel, {
      shouldValidate: true,
    })
  }, [form, preset, selectedPreset])

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t("openaiCompatible.addProvider")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-screen overflow-y-scroll sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("openaiCompatible.addProvider")}</DialogTitle>
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
                options={buildOpenaiCompatibleModelOptions(
                  selectedPresetConfig,
                )}
                required
              />
            )}
            <InputField
              label={t("fields.apiKey.label")}
              name="apiKey"
              required
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
              <DialogClose asChild>
                <Button type="button" variant="secondary">
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
      </DialogContent>
    </Dialog>
  )
}
