"use client"

import {
  AI_SEGMENT_IMAGE_TARGET_MAX_LENGTH,
  type AISegmentImageSchema,
  aiSegmentImageMatchSelection,
  aiSegmentImageSchema,
} from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
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
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useForm, useFormContext, useWatch } from "react-hook-form"
import { getAiProviderLabelKey } from "@/features/ai-agents/lib/ai-provider-label"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useRequestResolver } from "@/lib/validation/use-request-resolver"
import { matchSelectionLabelKeys } from "../labels"

type AISegmentImageDialogProps = {
  parentName: string
}

/** The optional details field is stored absent, never as "". */
const toStep = (values: AISegmentImageSchema): AISegmentImageSchema => ({
  ...values,
  detailsOutputFieldId: values.detailsOutputFieldId || undefined,
})

export const AISegmentImageDialog = ({
  parentName,
}: AISegmentImageDialogProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const { getValues: getParentValues, setValue: setParentValue } =
    useFormContext()

  const resolver = useRequestResolver<AISegmentImageSchema>({
    schema: aiSegmentImageSchema,
    toRequest: toStep,
    // The schema enforces the same two checks; these say which field to fix.
    rules: (values) => [
      Boolean(values.detailsOutputFieldId) &&
        values.detailsOutputFieldId === values.outputFieldId && {
          field: "detailsOutputFieldId",
          message: t("fields.aiSegmentImage.detailsOutputFieldId.sameAsOutput"),
        },
      Boolean(values.detailsOutputFieldId) &&
        values.detailsOutputFieldId === values.inputFieldId && {
          field: "detailsOutputFieldId",
          message: t("fields.aiSegmentImage.detailsOutputFieldId.sameAsInput"),
        },
    ],
  })

  const form = useForm<AISegmentImageSchema>({
    resolver,
    defaultValues: getParentValues(parentName),
  })
  const [inputFieldId, outputFieldId] = useWatch({
    control: form.control,
    name: ["inputFieldId", "outputFieldId"],
  })
  const replacesSource = Boolean(inputFieldId) && inputFieldId === outputFieldId

  useEffect(() => {
    if (!open) {
      return
    }
    form.reset(getParentValues(parentName))
  }, [open, parentName, form, getParentValues])

  const handleSubmit = form.handleSubmit((values) => {
    setParentValue(parentName, {
      ...getParentValues(parentName),
      ...toStep(values),
    })
    setOpen(false)
  })

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            {t("actions.edit")}
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="capitalize">
            {t("fields.flows.aiSegmentImage", {
              aiName: t(getAiProviderLabelKey("muse")),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("fields.aiSegmentImage.description")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="flex flex-col space-y-6" onSubmit={handleSubmit}>
            <div className="flex max-h-[calc(100vh-200px)] flex-col space-y-6 overflow-y-auto">
              <CustomFieldSelect
                allowCreate={false}
                includeReserved={false}
                label={t("fields.aiSegmentImage.inputFieldId.label")}
                name="inputFieldId"
                required
              />

              <InputField<AISegmentImageSchema>
                description={t("fields.aiSegmentImage.target.description")}
                label={t("fields.aiSegmentImage.target.label")}
                maxLength={AI_SEGMENT_IMAGE_TARGET_MAX_LENGTH}
                name="target"
                placeholder={t("fields.aiSegmentImage.target.placeholder")}
                required
              />

              <RadioGroupField<AISegmentImageSchema>
                label={t("fields.aiSegmentImage.matchSelection.label")}
                name="matchSelection"
                options={aiSegmentImageMatchSelection.options.map((value) => ({
                  value,
                  label: t(matchSelectionLabelKeys[value]),
                }))}
                required
              />

              <div className="flex flex-col gap-2">
                <CustomFieldSelect
                  allowCreate={true}
                  includeBotFields
                  includeReserved={false}
                  label={t("fields.aiSegmentImage.outputFieldId.label")}
                  name="outputFieldId"
                  required
                />
                {replacesSource && (
                  <p
                    className="text-amber-600 text-xs dark:text-amber-400"
                    role="status"
                  >
                    {t("fields.aiSegmentImage.overwriteWarning")}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <CustomFieldSelect
                  allowCreate={true}
                  clearable
                  includeBotFields
                  includeReserved={false}
                  label={t("fields.aiSegmentImage.detailsOutputFieldId.label")}
                  name="detailsOutputFieldId"
                />
                <p className="text-muted-foreground text-xs">
                  {t("fields.aiSegmentImage.detailsOutputFieldId.description")}
                </p>
              </div>
            </div>

            <DialogFooter className="flex items-end">
              <DialogClose
                render={
                  <Button size="sm" type="button" variant="ghost">
                    {t("actions.cancel")}
                  </Button>
                }
              />
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
