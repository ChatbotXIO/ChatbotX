"use client"

import {
  FieldOperationType,
  type SetCustomFieldStepSchema,
  setCustomFieldStepSchema,
} from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { getBrowserTimezone } from "@/features/contact-filter/lib/timezone"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useCustomFieldStore } from "@/features/custom-fields/provider/custom-field-store-context"

const SetCustomFieldStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const { setValue, getValues } = useFormContext()
  const defaultValues: SetCustomFieldStepSchema = getValues(parentName)

  const [open, setOpen] = useState<boolean>(false)
  const operations = [
    { label: t("flows.operators.set"), value: FieldOperationType.set },
    { label: t("flows.operators.append"), value: FieldOperationType.append },
    { label: t("flows.operators.prepend"), value: FieldOperationType.prepend },
  ]

  const customFieldForm = useForm<SetCustomFieldStepSchema>({
    resolver: zodResolver(setCustomFieldStepSchema),
    defaultValues,
  })

  // The selected field's type drives the temporal hint. `inputFieldId` is the
  // field id (or, for named lookups, its name), so match on either.
  const customFields = useCustomFieldStore((state) => state.customFields)
  const selectedFieldId = customFieldForm.watch("inputFieldId")
  const selectedFieldType = customFields.find(
    (field) =>
      field.id.toString() === selectedFieldId || field.name === selectedFieldId,
  )?.type
  const isTemporalField =
    selectedFieldType === "date" || selectedFieldType === "datetime"

  function onSubmit(values: SetCustomFieldStepSchema) {
    setValue(`${parentName}.inputFieldId`, values.inputFieldId)
    setValue(`${parentName}.operation`, values.operation)
    setValue(`${parentName}.value`, values.value)
    // Freeze the editor's browser zone so the worker (no browser context) can
    // anchor a naive date/datetime value and render "now" for a blank one.
    setValue(`${parentName}.timezone`, getBrowserTimezone())

    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div className="rounded-lg border-2 border-dashed p-4 text-sm">
          {t("flows.actions.setCustomField")}
        </div>
      </DialogTrigger>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>{t("flows.actions.setCustomField")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...customFieldForm}>
          <form
            className="flex flex-col gap-6"
            onSubmit={customFieldForm.handleSubmit(onSubmit)}
          >
            <CustomFieldSelect
              allowCreate={true}
              label={t("fields.customField.label")}
              name="inputFieldId"
              required
            />
            <SelectField
              label={t("fields.operation.label")}
              name="operation"
              options={operations}
              required
            />
            <div className="flex flex-col gap-1.5">
              <InputField label={t("fields.value.label")} name="value" />
              {isTemporalField ? (
                <p className="text-muted-foreground text-xs">
                  {t("flows.setCustomField.temporalHint")}
                </p>
              ) : null}
            </div>

            <div className="flex w-full items-center justify-end gap-2">
              <Button
                onClick={() => setOpen(false)}
                size={"sm"}
                type="button"
                variant={"link"}
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  !customFieldForm.formState.isValid ||
                  customFieldForm.formState.isSubmitting
                }
                size={"sm"}
                type="submit"
              >
                {t("actions.save")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default SetCustomFieldStepEditor
