"use client"

import {
  type ExecuteJavascriptStepSchema,
  executeJavascriptStepSchema,
} from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
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
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRight, CodeIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useFieldArray, useForm, useFormContext } from "react-hook-form"
import type { z } from "zod"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { BaseStepEditor } from "../base/editor"

const ExecuteJavascriptStepEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={CodeIcon}
      title={t("flows.actions.executeJavascript")}
    >
      <ExecuteJavascriptDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

const ExecuteJavascriptDialog = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { getValues, setValue } = useFormContext()
  const form = useForm<
    z.input<typeof executeJavascriptStepSchema>,
    unknown,
    ExecuteJavascriptStepSchema
  >({
    resolver: zodResolver(executeJavascriptStepSchema),
    defaultValues: getValues(parentName),
    mode: "onChange",
  })
  const { append, fields, remove } = useFieldArray({
    control: form.control,
    name: "mapping",
  })

  const onSubmit = (data: ExecuteJavascriptStepSchema) => {
    setValue(`${parentName}.code`, data.code)
    setValue(`${parentName}.mapping`, data.mapping)
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={() => (
          <div className="flex justify-center">
            <Button size="sm" type="button" variant="outline">
              {t("actions.edit")}
            </Button>
          </div>
        )}
      />
      <DialogContent className="max-h-screen max-w-md overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>{t("flows.actions.executeJavascript")}</DialogTitle>
          <DialogDescription>
            {t("fields.javascriptCode.description")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <TextareaField
              label={t("fields.javascriptCode.label")}
              name="code"
              placeholder={t("fields.javascriptCode.placeholder")}
              rows={10}
            />
            <Separator />
            <div>
              <Label className="mb-2">
                {t("fields.outputCustomField.label")}
              </Label>
              <div className="flex flex-col gap-3">
                {fields.map((field, index) => (
                  <div className="flex items-center gap-2" key={field.id}>
                    <div className="w-[40%]">
                      <InputField
                        name={`mapping.${index}.jsonPath`}
                        placeholder={t(
                          "fields.javascriptCode.returnPathPlaceholder",
                        )}
                      />
                    </div>
                    <ArrowRight size={24} />
                    <div className="w-[40%]">
                      <CustomFieldSelect
                        label=""
                        name={`mapping.${index}.outputFieldId`}
                      />
                    </div>
                    <Button
                      aria-label={t("actions.delete")}
                      className="text-destructive"
                      onClick={() => remove(index)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <XIcon className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  className="w-full"
                  onClick={() => append({ jsonPath: "", outputFieldId: "" })}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("actions.add")}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <DialogClose
                render={() => (
                  <Button size="sm" variant="ghost">
                    {t("actions.cancel")}
                  </Button>
                )}
              />
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

export default ExecuteJavascriptStepEditor
