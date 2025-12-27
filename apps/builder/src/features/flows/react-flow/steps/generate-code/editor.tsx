"use client"

import {
  type GenerateCodeStepSchema,
  GenerateCodeType,
  generateCodeStepSchema,
} from "@aha.chat/flow-config"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
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
import { ShuffleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { BaseStepEditor } from "../base/editor"

const GenerateCodeStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()

  return (
    <BaseStepEditor icon={ShuffleIcon} title={t("flows.actions.generateCode")}>
      <GenerateCodeDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

const GenerateCodeDialog = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { setValue, getValues } = useFormContext()

  const form = useForm<GenerateCodeStepSchema>({
    resolver: zodResolver(generateCodeStepSchema),
    defaultValues: {
      ...getValues(parentName),
    },
    mode: "onChange",
  })

  const onSubmit = (data: GenerateCodeStepSchema) => {
    setValue(`${parentName}.type`, data.type)
    setValue(`${parentName}.min`, data.min)
    setValue(`${parentName}.max`, data.max)
    setValue(`${parentName}.outputCfId`, data.outputCfId)
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div className="flex justify-center">
          <Button size="sm" type="button" variant="outline">
            {t("actions.update")}
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>{t("flows.actions.generateCode")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <SelectField
              label={t("fields.type.label")}
              name="type"
              options={[
                {
                  label: t("fields.numericLength.label"),
                  value: GenerateCodeType.NUMERIC_LENGTH,
                },
                {
                  label: t("fields.numericValue.label"),
                  value: GenerateCodeType.NUMERIC_VALUE,
                },
                {
                  label: t("fields.alphanumericLength.label"),
                  value: GenerateCodeType.ALPHANUMERIC_LENGTH,
                },
              ]}
              required
            />

            <InputField label={t("fields.min.label")} name="min" required />

            <InputField label={t("fields.max.label")} name="max" required />

            <CustomFieldSelect
              allowCreate={true}
              label={t("fields.customField.label")}
              name="outputCfId"
              required
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button size="sm" variant="ghost">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>

              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                size="sm"
                type="submit"
              >
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default GenerateCodeStepEditor
