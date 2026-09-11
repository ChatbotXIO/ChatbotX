"use client"

import {
  type ExecuteJavascriptStepSchema,
  executeJavascriptStepDefaultFn,
  executeJavascriptStepSchema,
} from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
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
import { ArrowRight, CodeIcon, CrosshairIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useFieldArray, useForm, useFormContext } from "react-hook-form"
import type { z } from "zod"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { BaseStepEditor } from "../base/editor"
import { useParentStepCommit } from "../base/use-parent-step-commit"
import {
  JsonSourceProvider,
  useJsonSourceContext,
} from "../external-request/components/json-source-context"
import { JsonSourcePanel } from "../external-request/components/json-source-panel"

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
      <JsonSourceProvider>
        <ExecuteJavascriptDialog parentName={parentName} />
      </JsonSourceProvider>
    </BaseStepEditor>
  )
}

const ExecuteJavascriptDialog = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { getValues } = useFormContext()
  const commitStep =
    useParentStepCommit<ExecuteJavascriptStepSchema>(parentName)
  const parentStep = getValues(parentName) as
    | Partial<ExecuteJavascriptStepSchema>
    | undefined

  const form = useForm<
    z.input<typeof executeJavascriptStepSchema>,
    unknown,
    ExecuteJavascriptStepSchema
  >({
    resolver: zodResolver(executeJavascriptStepSchema),
    defaultValues: {
      ...executeJavascriptStepDefaultFn(),
      ...parentStep,
      mapping:
        parentStep?.mapping && parentStep.mapping.length > 0
          ? parentStep.mapping
          : [{ jsonPath: "", outputFieldId: "" }],
    },
    mode: "onChange",
  })

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

  // Starts handleAppendMapping: add a JSON-path mapping row.
  const handleAppendMapping = () => {
    append({ jsonPath: "", outputFieldId: "" })
    setActiveTargetIndex(fields.length)
  }
  // Ends handleAppendMapping.

  // Starts handleRemoveMapping: drop a JSON-path mapping row.
  const handleRemoveMapping = (index: number) => {
    remove(index)
    if (activeTargetIndex === index) {
      setActiveTargetIndex(null)
    }
  }
  // Ends handleRemoveMapping.

  // Starts handleSelectPath: fill the active row from the JSON tree picker.
  const handleSelectPath = (path: string) => {
    if (activeTargetIndex === null) {
      return
    }
    form.setValue(`mapping.${activeTargetIndex}.jsonPath`, path, {
      shouldValidate: true,
      shouldDirty: true,
    })
  }
  // Ends handleSelectPath.

  // Starts onSubmit: persist code, dump field, and JSON-path mapping.
  const onSubmit = (data: ExecuteJavascriptStepSchema) => {
    commitStep({
      code: data.code,
      customFieldId: data.customFieldId,
      mapping: data.mapping,
    })
    setOpen(false)
  }
  // Ends onSubmit.

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            {t("actions.edit")}
          </Button>
        }
      />
      <DialogContent className="max-h-screen max-w-md overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>{t("flows.actions.executeJavascript")}</DialogTitle>
          <DialogDescription>
            <span className="block">
              {t("fields.javascriptCode.description")}
            </span>
            <span className="mt-2 block">
              {t("fields.javascriptCode.objectMapping")}
            </span>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <TiptapEditorField
              enableEmoji={false}
              includeBotFieldVariables
              label={t("fields.javascriptCode.label")}
              name="code"
              placeholder={t("fields.javascriptCode.placeholder")}
              required
              showEmojiPicker={false}
            />

            <Separator />

            <JsonSourcePanel
              activeTargetLabel={
                activeTargetIndex === null
                  ? null
                  : String(activeTargetIndex + 1)
              }
              onSelectPath={handleSelectPath}
              showTestResponseTab={false}
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
                      <ArrowRight className="rtl:rotate-180" size={24} />
                    </div>
                    <div className="w-[40%]">
                      <CustomFieldSelect
                        allowCreate={true}
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

            <CustomFieldSelect
              allowCreate={true}
              clearable
              label={t("fields.outputCustomField.javascriptDumpLabel")}
              name="customFieldId"
            />
            <p className="text-muted-foreground text-xs">
              {t("fields.outputCustomField.javascriptOptional")}
            </p>
            <DialogFooter>
              <DialogClose
                render={
                  <Button size="sm" variant="ghost">
                    {t("actions.cancel")}
                  </Button>
                }
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
