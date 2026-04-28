"use client"

import { aiExtractDataSchema } from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
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
import { ArrowRightIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import {
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { AIModelSelect } from "../../ai-generate-text/components/ai-model-select"

type AIExtractDataDialogProps = {
  parentName: string
}

export const AIExtractDataDialog = ({
  parentName,
}: AIExtractDataDialogProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const {
    control: parentControl,
    getValues: getParentValues,
    setValue: setParentValue,
  } = useFormContext()
  const provider = useWatch({
    name: `${parentName}.provider`,
    control: parentControl,
  })

  const form = useForm({
    resolver: zodResolver(aiExtractDataSchema),
    defaultValues: getParentValues(parentName),
  })

  const inputType = useWatch({
    name: "inputType",
    control: form.control,
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "extractFields",
  })

  const handleSubmit = form.handleSubmit((values) => {
    const currentValues = getParentValues(parentName)

    setParentValue(parentName, {
      ...currentValues,
      ...values,
      provider: provider ?? currentValues.provider,
    })

    setOpen(false)
  })

  const inputTypeOptions = [
    { label: t("fields.inputType.options.text"), value: "text" },
    { label: t("fields.inputType.options.image"), value: "image" },
    { label: t("fields.inputType.options.file"), value: "file" },
  ]

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          {t("actions.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="capitalize">
            {t("fields.flows.aiExtractData", {
              aiName: t(`aiProviders.${provider}`),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form className="flex flex-col space-y-6" onSubmit={handleSubmit}>
            <div className="flex max-h-[calc(100vh-200px)] flex-col space-y-6 overflow-y-auto pr-2">
              <SelectField
                label={t("fields.inputType.label")}
                name="inputType"
                options={inputTypeOptions}
                required
              />

              {inputType === "text" ? (
                <TiptapEditorField
                  label="Input Text"
                  name="inputFieldId"
                  required
                />
              ) : (
                <CustomFieldSelect
                  allowCreate={true}
                  includeReserved={false}
                  label={inputType === "image" ? "Image" : "File"}
                  name="inputFieldId"
                  required
                />
              )}

              <AIModelSelect name="model" provider={provider} required />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">
                    {t("fields.extractFields.label")}
                  </span>
                  <Button
                    className="h-auto p-0 text-primary hover:no-underline"
                    onClick={() => append({ key: "", customFieldId: "" })}
                    type="button"
                    variant="link"
                  >
                    {t("actions.addNew")}
                  </Button>
                </div>

                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div
                      className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3"
                      key={field.id}
                    >
                      <InputField
                        label=""
                        name={`extractFields.${index}.key`}
                        placeholder={t("fields.extractFields.key.placeholder")}
                        required
                      />
                      <ArrowRightIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <CustomFieldSelect
                        allowCreate={true}
                        includeReserved={false}
                        label=""
                        name={`extractFields.${index}.customFieldId`}
                        placeholder={t(
                          "fields.extractFields.customFieldId.label",
                        )}
                        required
                      />
                      <Button
                        className="h-10 w-10 flex-shrink-0"
                        onClick={() => remove(index)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <XIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  className="h-12 w-full bg-[#F5F5F5] font-normal text-foreground hover:bg-[#EEEEEE]"
                  onClick={() => append({ key: "", customFieldId: "" })}
                  type="button"
                  variant="secondary"
                >
                  {t("actions.addNew")}
                </Button>
              </div>
            </div>

            <DialogFooter className="flex items-end">
              <DialogClose asChild>
                <Button size="sm" type="button" variant="ghost">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>
              <Button size="sm" type="submit">
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
