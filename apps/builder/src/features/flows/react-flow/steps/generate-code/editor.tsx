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
import { T } from "@tolgee/react"
import { ShuffleIcon } from "lucide-react"
import { useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { BaseStepEditor } from "../base/editor"

export default function GenerateCodeStepEditor({
  parentName,
}: {
  parentName: string
}) {
  return (
    <BaseStepEditor
      icon={ShuffleIcon}
      title={<T keyName="flows.StepType.GenerateCode" />}
    >
      <GenerateCodeDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

function GenerateCodeDialog({ parentName }: { parentName: string }) {
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
    setValue(`${parentName}.outputCustomFieldId`, data.outputCustomFieldId)
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div className="flex justify-center">
          <Button size="sm" variant="outline">
            Edit
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Generate code</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <SelectField
              isRequired
              label="Type"
              name="type"
              options={[
                {
                  label: "Numeric (Minimum/Maximum length)",
                  value: GenerateCodeType.NUMERIC_LENGTH,
                },
                {
                  label: "Numeric (Minimum/Maximum number)",
                  value: GenerateCodeType.NUMERIC_VALUE,
                },
                {
                  label: "Alphanumeric (Minimum/Maximum length)",
                  value: GenerateCodeType.ALPHANUMERIC_LENGTH,
                },
              ]}
            />

            <InputField isRequired label="Min" name="min" />

            <InputField isRequired label="Max" name="max" />

            <CustomFieldSelect
              allowCreate={true}
              isRequired
              label="Save to custom field"
              name="outputCustomFieldId"
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>

              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
