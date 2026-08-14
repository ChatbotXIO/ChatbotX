"use client"

import {
  type ExecuteJavascriptStepSchema,
  executeJavascriptStepSchema,
} from "@chatbotx.io/flow-config"
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
import { CodeIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import type { z } from "zod"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
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

  const onSubmit = (data: ExecuteJavascriptStepSchema) => {
    setValue(`${parentName}.code`, data.code)
    setValue(`${parentName}.customFieldId`, data.customFieldId)
    setOpen(false)
  }

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
            {t("fields.javascriptCode.description")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <TiptapEditorField
              enableEmoji={false}
              label={t("fields.javascriptCode.label")}
              name="code"
              placeholder={t("fields.javascriptCode.placeholder")}
              required
              showEmojiPicker={false}
            />
            <CustomFieldSelect
              allowCreate={true}
              label={t("fields.outputCustomField.label")}
              name="customFieldId"
            />
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
