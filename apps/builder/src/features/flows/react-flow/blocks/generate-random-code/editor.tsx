"use client"

import { FormInput } from "@/components/form-input"
import { NumberField } from "@/components/number-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { GenerateTypeSelect } from "@/features/flows/react-flow/blocks/generate-random-code/generate-type-select"
import {
  type GenerateRandomCodeSchema,
  GenerateType,
  generateRandomCodeSchema,
} from "@/features/flows/react-flow/blocks/generate-random-code/schema"
import { CustomFieldType } from "@ahachat.ai/database"
import { zodResolver } from "@hookform/resolvers/zod"
import { T, useTranslate } from "@tolgee/react"
import { ShuffleIcon } from "lucide-react"
import React from "react"
import { useForm, useFormContext } from "react-hook-form"

interface generateRandomCodeEditorProps {
  parentName: string
}

export const GenerateRandomCodeEditor = ({
  parentName,
}: generateRandomCodeEditorProps) => {
  const { t } = useTranslate()
  const [open, setOpen] = React.useState(false)

  const { setValue: setValueOriginEditor, getValues: getValuesOriginEditor } =
    useFormContext()
  const schema: GenerateRandomCodeSchema = getValuesOriginEditor(parentName)

  const form = useForm<GenerateRandomCodeSchema>({
    resolver: zodResolver(generateRandomCodeSchema),
    defaultValues: schema,
    mode: "onChange",
  })

  const { watch, getValues, formState, setValue } = form
  const type = watch("type")

  const onChangeType = (value: GenerateType) => {
    setValue("type", value)
    setValue("customFieldId", "")
  }

  const onSave = () => {
    setValueOriginEditor(parentName, getValues())
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="flex flex-col items-center rounded-md bg-slate-200 p-2 border-2 border-transparent transition-all ease-in hover:border-blue-500 hover:cursor-pointer hover:shadow-xl">
          <div className="flex items-center justify-center gap-2">
            <ShuffleIcon size={20} className="text-yellow-500" />
            <T keyName="flows.ActionType.RandomCode" />
          </div>
        </div>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="capitalize">
            {t("flows.ActionType.RandomCode")}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <div className="flex flex-col gap-4">
            <GenerateTypeSelect
              name="type"
              onValueChange={(value: GenerateType) => onChangeType(value)}
            />

            <FormInput name="min" label={<T keyName={"common.minimum"} />}>
              <NumberField name="min" step={1} min={0} />
            </FormInput>

            <FormInput name="max" label={<T keyName={"common.maximum"} />}>
              <NumberField name="max" step={1} min={0} />
            </FormInput>

            <CustomFieldSelect
              name="customFieldId"
              label="Save response to a custom field"
              customFieldType={
                type === GenerateType.AlphanumericMinMaxLength
                  ? CustomFieldType.SHORTTEXT
                  : CustomFieldType.NUMBER
              }
              allowCreate={true}
            />
          </div>
        </Form>

        <DialogFooter className="flex items-end">
          <DialogClose asChild>
            <Button type="button" variant="secondary" size="sm">
              <T keyName="common.cancelBtn" />
            </Button>
          </DialogClose>

          <Button
            type="button"
            size="sm"
            disabled={!formState.isValid}
            onClick={onSave}
          >
            <T keyName="common.save" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
