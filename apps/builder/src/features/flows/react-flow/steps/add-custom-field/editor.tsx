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
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import type { AddCustomFieldStepSchema } from "@ahachat.ai/flow-config"
import { zodResolver } from "@hookform/resolvers/zod"
import { T } from "@tolgee/react"
import { useForm } from "react-hook-form"
import { addCustomFieldStep } from "."
import { Form } from "@/components/ui/form"
import { useState } from "react"

const AddCustomFieldStepEditor = ({ parentName }: { parentName: string }) => {
  const [open, setOpen] = useState<boolean>(false)
  const operations = [
    { label: "Set to", value: "set" },
    { label: "Append to the end", value: "append" },
    { label: "Prepend to the start", value: "prepend" },
  ]

  const customFieldForm = useForm<AddCustomFieldStepSchema>({
    resolver: zodResolver(addCustomFieldStep.validator),
    defaultValues: addCustomFieldStep.defaultFn(),
  })

  function onSubmit(values: AddCustomFieldStepSchema) {
    // Do something with the form values.
    // ✅ This will be type-safe and validated.
    console.log(values)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <T keyName="Set custom field" />
        </Button>
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
              name={`${parentName}.customFieldId`}
              label="Custom Field"
              allowCreate={true}
            />
            <SelectField
              name={`${parentName}.operation`}
              label="Operation"
              options={operations}
              isRequired={true}
            />
            <InputField name={`${parentName}.value`} label="Value" />
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

export { AddCustomFieldStepEditor }
