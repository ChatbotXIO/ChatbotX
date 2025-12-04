"use client"

import {
  FieldOperationType,
  type SetCustomFieldStepSchema,
  setCustomFieldStepSchema,
} from "@aha.chat/flow-config"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"

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

  function onSubmit(values: SetCustomFieldStepSchema) {
    setValue(`${parentName}.inputCfId`, values.inputCfId)
    setValue(`${parentName}.operation`, values.operation)
    setValue(`${parentName}.value`, values.value)

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
              name="inputCfId"
              required
            />
            <SelectField
              label={t("fields.operation.label")}
              name="operation"
              options={operations}
              required
            />
            <InputField label={t("fields.value.label")} name="value" />

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
