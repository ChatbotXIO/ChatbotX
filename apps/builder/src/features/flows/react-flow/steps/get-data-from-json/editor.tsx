"use client"

import { InputField } from "@/components/form/input-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { Label } from "@/components/ui/label"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import {
  getDataFromJsonStepSchema,
  type GetDataFromJsonStepSchema,
} from "@ahachat.ai/flow-config"
import { zodResolver } from "@hookform/resolvers/zod"
import { T } from "@tolgee/react"
import { ArrowRight, CodeIcon } from "lucide-react"
import { useState } from "react"
import { useFieldArray, useForm, useFormContext } from "react-hook-form"
import { BaseStepEditor } from "../base/editor"

export default function GetDataFromJsonStepEditor({
  parentName,
}: { parentName: string }) {
  return (
    <BaseStepEditor
      icon={CodeIcon}
      title={<T keyName="flows.StepType.GetDataFromJson" />}
    >
      <GetDataFromJsonDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

function GetDataFromJsonDialog({ parentName }: { parentName: string }) {
  const [open, setOpen] = useState(false)
  const { setValue, getValues } = useFormContext()

  const form = useForm<GetDataFromJsonStepSchema>({
    resolver: zodResolver(getDataFromJsonStepSchema),
    defaultValues: {
      ...getValues(parentName),
    },
    mode: "onChange",
  })

  const { fields, append } = useFieldArray({
    control: form.control,
    name: "mapping",
  })

  const onSubmit = (data: GetDataFromJsonStepSchema) => {
    setValue(`${parentName}.inputCustomFieldId`, data.inputCustomFieldId)
    setValue(`${parentName}.mapping`, data.mapping)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="flex justify-center">
          <Button variant="outline" size="sm">
            Edit
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Get data from JSON</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col w-full gap-4"
          >
            <CustomFieldSelect
              name="inputCustomFieldId"
              label="Date & Time Custom field"
              isRequired
            />

            <div>
              <div className="flex w-full justify-between">
                <Label>Save response to a custom field</Label>
                <Button
                  size="sm"
                  variant="link"
                  className="text-sm text-destructive"
                  onClick={() =>
                    append({ jsonPath: "", outputCustomFieldId: "" })
                  }
                >
                  Add new
                </Button>
              </div>
              <div className="flex flex-col w-full gap-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex w-full gap-x-2">
                    <div className="w-[45%]">
                      <InputField name={`mapping.${index}.jsonPath`} />
                    </div>
                    <div className="flex h-[36px] items-center justify-center">
                      <ArrowRight size={24} />
                    </div>
                    <div className="w-[45%]">
                      <CustomFieldSelect
                        name={`mapping.${index}.outputCustomFieldId`}
                        label=""
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>

              <Button
                type="submit"
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
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
