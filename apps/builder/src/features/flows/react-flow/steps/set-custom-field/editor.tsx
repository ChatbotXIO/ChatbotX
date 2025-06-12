"use client"

import { InputField } from "@/components/form/input-field"
import { SelectField } from "@/components/form/select-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { SetCustomFieldStepSchema } from "@ahachat.ai/flow-config"
import { zodResolver } from "@hookform/resolvers/zod"
import { T } from "@tolgee/react"
import { useForm, useFormContext } from "react-hook-form"
import { setCustomFieldStep } from "."
import { Form } from "@/components/ui/form"
import { useState } from "react"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"

const SetCustomFieldStepEditor = ({ parentName }: { parentName: string }) => {
  const { setValue, getValues } = useFormContext()
  const defaultValue: SetCustomFieldStepSchema = getValues(parentName)

  const [open, setOpen] = useState<boolean>(false)
  const operations = [
    { label: "Set to", value: "set" },
    { label: "Append to the end", value: "append" },
    { label: "Prepend to the start", value: "prepend" },
  ]

  const customFieldForm = useForm<SetCustomFieldStepSchema>({
    resolver: zodResolver(setCustomFieldStep.validator),
    defaultValues: defaultValue ?? setCustomFieldStep.defaultFn(),
  })

  function onSubmit(values: SetCustomFieldStepSchema) {
    setValue(`${parentName}.customFieldId`, values.customFieldId)
    setValue(`${parentName}.operation`, values.operation)
    setValue(`${parentName}.value`, values.value)

    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="rounded-lg border-2 border-dashed p-4 text-sm">
          <T keyName="flows.StepType.SetCustomField" />
        </div>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Custom Field</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...customFieldForm}>
          <form
            onSubmit={customFieldForm.handleSubmit(onSubmit)}
            className="flex flex-col gap-2"
          >
            <CustomFieldSelect
              name="customFieldId"
              label="Custom Field"
              allowCreate={true}
            />
            <SelectField
              name="operation"
              label="Operation"
              options={operations}
              isRequired={true}
            />
            <InputField name="value" label="Value" />

            <div className="flex items-center justify-center gap-2 w-full">
              <Button
                variant={"link"}
                size={"sm"}
                type="button"
                onClick={() => setOpen(false)}
              >
                <T keyName={"common.cancelBtn"} />
              </Button>
              <Button
                size={"sm"}
                disabled={
                  !customFieldForm.formState.isValid ||
                  customFieldForm.formState.isSubmitting
                }
              >
                <T keyName={"common.confirmBtn"} />
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export { SetCustomFieldStepEditor }
