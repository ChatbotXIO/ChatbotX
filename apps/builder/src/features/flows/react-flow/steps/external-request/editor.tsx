"use client"

import {
  type ExternalRequestStepSchema,
  externalRequestBodyTypes,
  externalRequestMethods,
  externalRequestStepSchema,
  methodsWithBody,
} from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
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
import { cn } from "@chatbotx.io/ui/lib/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRight, CrosshairIcon, GlobeIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import {
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import type { z } from "zod"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { BaseStepEditor } from "../base/editor"
import {
  JsonSourceProvider,
  useJsonSourceContext,
} from "./components/json-source-context"
import { JsonSourcePanel } from "./components/json-source-panel"
import { KeyValueFieldArray } from "./components/key-value-field-array"
import { TestNowPanel } from "./components/test-now-panel"

const ExternalRequestStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  return (
    <BaseStepEditor icon={GlobeIcon} title={t("flows.actions.callApi")}>
      <JsonSourceProvider>
        <ExternalRequestDialog parentName={parentName} />
      </JsonSourceProvider>
    </BaseStepEditor>
  )
}

const ExternalRequestDialog = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { setValue, getValues } = useFormContext()

  const form = useForm<
    z.input<typeof externalRequestStepSchema>,
    unknown,
    ExternalRequestStepSchema
  >({
    resolver: zodResolver(externalRequestStepSchema),
    defaultValues: {
      ...getValues(parentName),
    },
    mode: "onChange",
  })

  const method = useWatch({ control: form.control, name: "method" })
  const bodyType = useWatch({ control: form.control, name: "body.bodyType" })
  const showBody = Boolean(
    method && (methodsWithBody as readonly string[]).includes(method),
  )

  useEffect(() => {
    if (!showBody && form.getValues("body") !== undefined) {
      form.setValue("body", undefined, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }, [showBody, form])

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "mapping",
  })

  const { activeTargetIndex, setActiveTargetIndex } = useJsonSourceContext()

  useEffect(() => {
    if (open && activeTargetIndex === null && fields.length > 0) {
      setActiveTargetIndex(0)
    }
  }, [open, setActiveTargetIndex, fields.length, activeTargetIndex])

  const handleAppendMapping = () => {
    append({ jsonPath: "", outputFieldId: "" })
    setActiveTargetIndex(fields.length)
  }

  const handleRemoveMapping = (index: number) => {
    remove(index)
    if (activeTargetIndex === index) {
      setActiveTargetIndex(null)
    }
  }

  const handleSelectPath = (path: string) => {
    if (activeTargetIndex === null) {
      return
    }
    form.setValue(`mapping.${activeTargetIndex}.jsonPath`, path, {
      shouldValidate: true,
      shouldDirty: true,
    })
  }

  const onSubmit = (data: ExternalRequestStepSchema) => {
    setValue(`${parentName}.method`, data.method)
    setValue(`${parentName}.url`, data.url)
    setValue(`${parentName}.headers`, data.headers)
    setValue(`${parentName}.body`, data.body)
    setValue(`${parentName}.mapping`, data.mapping)
    setOpen(false)
  }

  const methodOptions = externalRequestMethods.options.map((value) => ({
    value,
    label: value,
  }))

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div className="flex justify-center">
          <Button size="sm" type="button" variant="outline">
            {t("actions.edit")}
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent className={"max-h-screen max-w-md overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>{t("flows.actions.callApi")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <div className="flex gap-x-2">
              <div className="w-[30%]">
                <SelectField
                  label={t("fields.httpMethod.label")}
                  name="method"
                  options={methodOptions}
                />
              </div>
              <div className="w-[70%]">
                <InputField
                  label={t("fields.requestUrl.label")}
                  name="url"
                  placeholder={t("fields.requestUrl.placeholder")}
                />
              </div>
            </div>

            <div>
              <Label className="mb-2">{t("fields.requestHeaders.label")}</Label>
              <KeyValueFieldArray
                keyPlaceholder={t("fields.requestHeaders.keyPlaceholder")}
                name="headers"
                valuePlaceholder={t("fields.requestHeaders.valuePlaceholder")}
              />
            </div>

            {showBody && (
              <div className="flex flex-col gap-2">
                <SelectField
                  label={t("fields.bodyType.label")}
                  name="body.bodyType"
                  options={[
                    {
                      value: externalRequestBodyTypes.enum.allContactData,
                      label: t("fields.bodyType.options.allContactData"),
                    },
                    {
                      value: externalRequestBodyTypes.enum.json,
                      label: t("fields.bodyType.options.json"),
                    },
                    {
                      value: externalRequestBodyTypes.enum.formEncoded,
                      label: t("fields.bodyType.options.formEncoded"),
                    },
                  ]}
                />

                {bodyType === externalRequestBodyTypes.enum.json && (
                  <TextareaField
                    label={t("fields.requestBody.label")}
                    name="body.jsonBody"
                    rows={4}
                  />
                )}

                {bodyType === externalRequestBodyTypes.enum.formEncoded && (
                  <KeyValueFieldArray
                    keyPlaceholder={t("fields.requestBody.keyPlaceholder")}
                    name="body.formFields"
                    valuePlaceholder={t("fields.requestBody.valuePlaceholder")}
                  />
                )}
              </div>
            )}

            <Separator />

            <TestNowPanel />

            <JsonSourcePanel
              activeTargetLabel={
                activeTargetIndex === null
                  ? null
                  : String(activeTargetIndex + 1)
              }
              onSelectPath={handleSelectPath}
            />

            <div>
              <Label className="mb-2">
                {t("fields.outputCustomField.label")}
              </Label>
              <div className="flex w-full flex-col gap-y-4">
                {fields.map((field, index) => (
                  <div
                    className="flex w-full items-center gap-x-2"
                    key={field.id}
                  >
                    <Button
                      aria-label={t("fields.jsonPath.targetThisRow")}
                      className={cn(
                        "text-muted-foreground",
                        activeTargetIndex === index && "text-primary",
                      )}
                      onClick={() => setActiveTargetIndex(index)}
                      size="icon"
                      title={t("fields.jsonPath.targetThisRow")}
                      type="button"
                      variant="ghost"
                    >
                      <CrosshairIcon className="h-4 w-4" />
                    </Button>
                    <div className="w-[40%]">
                      <InputField
                        name={`mapping.${index}.jsonPath`}
                        onFocus={() => setActiveTargetIndex(index)}
                        placeholder={t("fields.jsonPath.placeholder")}
                      />
                    </div>
                    <div className="flex h-[36px] items-center justify-center">
                      <ArrowRight size={24} />
                    </div>
                    <div className="w-[40%]">
                      <CustomFieldSelect
                        label=""
                        name={`mapping.${index}.outputFieldId`}
                      />
                    </div>
                    <Button
                      className="text-destructive text-sm"
                      onClick={() => handleRemoveMapping(index)}
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
                  onClick={handleAppendMapping}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("actions.add")}
                </Button>
              </div>
            </div>

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

export default ExternalRequestStepEditor
