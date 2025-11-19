"use client"

import {
  type GetDataFromJsonStepSchema,
  getDataFromJsonStepSchema,
} from "@aha.chat/flow-config"
import { InputField } from "@aha.chat/ui/components/form/input-field"
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
import { Label } from "@aha.chat/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRight, CodeIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useFieldArray, useForm, useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { BaseStepEditor } from "../base/editor"

const GetDataFromJsonStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  return (
    <BaseStepEditor icon={CodeIcon} title={t("flows.actions.getDataFromJson")}>
      <GetDataFromJsonDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

const GetDataFromJsonDialog = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
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
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div className="flex justify-center">
          <Button size="sm" variant="outline">
            {t("actions.update")}
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent className={"max-h-screen max-w-md overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>{t("flows.actions.getDataFromJson")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <CustomFieldSelect
              label={t("fields.inputCustomField.label")}
              name="inputCustomFieldId"
              required
            />

            <div>
              <div className="flex w-full justify-between">
                <Label>{t("fields.outputCustomField.label")}</Label>
                <Button
                  className="text-destructive text-sm"
                  onClick={() =>
                    append({ jsonPath: "", outputCustomFieldId: "" })
                  }
                  size="sm"
                  variant="link"
                >
                  {t("actions.add")}
                </Button>
              </div>
              <div className="flex w-full flex-col gap-y-4">
                {fields.map((field, index) => (
                  <div className="flex w-full gap-x-2" key={field.id}>
                    <div className="w-[45%]">
                      <InputField name={`mapping.${index}.jsonPath`} />
                    </div>
                    <div className="flex h-[36px] items-center justify-center">
                      <ArrowRight size={24} />
                    </div>
                    <div className="w-[45%]">
                      <CustomFieldSelect
                        name={`mapping.${index}.outputCustomFieldId`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{t("actions.cancel")}</Button>
              </DialogClose>

              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
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

export default GetDataFromJsonStepEditor
