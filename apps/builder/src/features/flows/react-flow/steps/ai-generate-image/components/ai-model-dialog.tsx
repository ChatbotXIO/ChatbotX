"use client"

import { aiGenerateImageSchema } from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
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
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useForm, useFormContext, useWatch } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import {
  geminiAspectRatioOptions,
  imageQualityOptions,
  imageSizeOptions,
} from "../constants"
import { AIModelSelect } from "./ai-model-select"

type AIModelDialogProps = {
  parentName: string
}

const mapToSelectOptions = (
  options: readonly { labelKey: string; value: string }[],
  translate: (key: string) => string,
) =>
  options.map((opt) => ({
    label: translate(opt.labelKey),
    value: opt.value,
  }))

export const AIModelDialog = ({ parentName }: AIModelDialogProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const { control, getValues, setValue } = useFormContext()
  const provider = useWatch({ name: `${parentName}.provider`, control })

  const form = useForm({
    resolver: zodResolver(aiGenerateImageSchema),
    defaultValues: getValues(parentName),
  })

  useEffect(() => {
    if (!open) {
      return
    }
    form.reset(getValues(parentName))
  }, [open, parentName, form, getValues])

  const handleSubmit = form.handleSubmit((values) => {
    const currentValues = getValues(parentName)

    setValue(parentName, {
      ...currentValues,
      ...values,
      provider: provider ?? currentValues.provider,
    })

    setOpen(false)
  })

  const isGemini = provider === "gemini"
  const qualityOptions = mapToSelectOptions(imageQualityOptions, t)
  const sizeOptions = mapToSelectOptions(
    isGemini ? geminiAspectRatioOptions : imageSizeOptions,
    t,
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          {t("actions.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="capitalize">
            {t("fields.flows.aiGenerateImage.label", {
              aiName: t(`aiProviders.${provider}`),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form className="flex flex-col space-y-6" onSubmit={handleSubmit}>
            <div className="flex max-h-[calc(100vh-200px)] flex-col space-y-6 overflow-y-auto">
              <AIModelSelect name="model" provider={provider} required />

              <InputField
                label={t("fields.prompt.label")}
                name="prompt"
                required
              />

              {!isGemini && (
                <SelectField
                  label={t("fields.quality.label")}
                  name="quality"
                  options={qualityOptions}
                  required
                />
              )}

              <SelectField
                label={
                  isGemini
                    ? t("fields.aspectRatio.label")
                    : t("fields.size.label")
                }
                name="size"
                options={sizeOptions}
                required
              />

              <CustomFieldSelect
                allowCreate={true}
                includeReserved={false}
                label={t("fields.outputFieldId.label")}
                name="outputCfId"
                required
              />
            </div>

            <DialogFooter className="flex items-end">
              <DialogClose asChild>
                <Button size="sm" type="button" variant="ghost">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>
              <Button size="sm" type="submit">
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
