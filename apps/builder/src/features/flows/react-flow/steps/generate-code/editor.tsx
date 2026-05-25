"use client"

import {
  type GenerateCodeStepInput,
  type GenerateCodeStepSchema,
  GenerateCodeType,
  generateCodeStepSchema,
} from "@chatbotx.io/flow-config"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
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
import { ShuffleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import {
  type Resolver,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
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

  const resolver = useCallback<
    Resolver<GenerateCodeStepInput, object, GenerateCodeStepSchema>
  >(
    async (values, context, options) => {
      const base = zodResolver(generateCodeStepSchema) as Resolver<
        GenerateCodeStepInput,
        object,
        GenerateCodeStepSchema
      >
      const result = await base(values, context, options)
      if (result.errors.max?.type === "custom") {
        result.errors.max = {
          type: "manual",
          message: t("validation.maxMustBeGreaterThanMin", {
            maxField: t("fields.max.label"),
            minField: t("fields.min.label"),
          }),
        }
      }
      return result
    },
    [t],
  )

  const form = useForm<GenerateCodeStepInput, object, GenerateCodeStepSchema>({
    resolver,
    defaultValues: {
      ...getValues(parentName),
    },
    mode: "onChange",
  })

  const min = useWatch({
    control: form.control,
    name: "min",
  })
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-trigger max validation when min changes
  useEffect(() => {
    form.trigger("max")
  }, [min, form])

  useEffect(() => {
    if (open) {
      form.reset(getValues(parentName))
    }
  }, [open, form, getValues, parentName])

  const onSubmit = (data: GenerateCodeStepSchema) => {
    setValue(parentName, data)
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div className="flex justify-center">
          <Button size="sm" type="button" variant="outline">
            {t("actions.edit")}
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent className="max-h-screen overflow-y-scroll lg:max-w-5xl">
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

            <InputNumberField
              label={t("fields.min.label")}
              name="min"
              required
            />

            <InputNumberField
              label={t("fields.max.label")}
              name="max"
              required
            />

            <CustomFieldSelect
              allowCreate={true}
              label={t("fields.customField.label")}
              name="outputFieldId"
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
