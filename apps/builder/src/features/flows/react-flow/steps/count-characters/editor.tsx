"use client"

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
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import {
  countCharactersStepSchema,
  type CountCharactersStepSchema,
} from "@ahachat.ai/flow-config"
import { zodResolver } from "@hookform/resolvers/zod"
import { T } from "@tolgee/react"
import { CalculatorIcon } from "lucide-react"
import { useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { BaseStepEditor } from "../base/editor"

export default function CountCharactersStepEditor({
  parentName,
}: { parentName: string }) {
  return (
    <BaseStepEditor
      icon={CalculatorIcon}
      title={<T keyName="flows.StepType.CountCharacters" />}
    >
      <CountCharactersDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

function CountCharactersDialog({ parentName }: { parentName: string }) {
  const [open, setOpen] = useState(false)
  const { setValue, getValues } = useFormContext()

  const form = useForm<CountCharactersStepSchema>({
    resolver: zodResolver(countCharactersStepSchema),
    defaultValues: {
      ...getValues(parentName),
    },
    mode: "onChange",
  })

  const onSubmit = (data: CountCharactersStepSchema) => {
    setValue(`${parentName}.inputCustomFieldId`, data.inputCustomFieldId)
    setValue(`${parentName}.outputCustomFieldId`, data.outputCustomFieldId)
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
          <DialogTitle>Count Characters</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col w-full gap-4"
          >
            <CustomFieldSelect
              name="inputCustomFieldId"
              label="Custom field"
              isRequired
            />

            <CustomFieldSelect
              name="outputCustomFieldId"
              label="Save to custom field"
              isRequired
              allowCreate={true}
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
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
