"use client"

import {
  type GetUserDataStepSchema,
  getUserDataStepDefaultFn,
  getUserDataStepSchema,
  ReplyFormat,
} from "@aha.chat/flow-config"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { InputNumberField } from "@aha.chat/ui/components/form/input-number-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { SwitchField } from "@aha.chat/ui/components/form/switch-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { Label } from "@aha.chat/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { KeyboardIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { useForm, useFormContext, useWatch } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import CustomFieldField from "@/features/custom-fields/components/custom-field-field"
import { BaseStepEditor } from "../base/editor"
import DelayUnitSelect from "../wait/components/delay-unit-select"

type GetUserDataStepFormProps = {
  parentName: string
  onSuccess?: () => void
  onCancel?: () => void
}

const GetUserDataStepForm = ({
  parentName,
  onSuccess,
  onCancel,
}: GetUserDataStepFormProps) => {
  const t = useTranslations()

  const { getValues: getParentValues, setValue: setParentValue } =
    useFormContext()

  const form = useForm({
    resolver: zodResolver(getUserDataStepSchema),
    defaultValues: getUserDataStepDefaultFn(),
    mode: "onChange",
  })

  useEffect(() => {
    form.reset(getParentValues(parentName))
  }, [form, getParentValues, parentName])

  const replyFormatOptions = useMemo(
    () =>
      Object.entries(ReplyFormat).map(([key, value]) => ({
        label: t(`fields.replyFormat.${key}`),
        value,
      })),
    [t],
  )

  const autoSkip = useWatch({ name: "autoSkip", control: form.control })

  const handleCancel = () => {
    form.reset()
    onCancel?.()
  }

  const onSubmit = (data: GetUserDataStepSchema) => {
    setParentValue(parentName, data)
    onSuccess?.()
  }

  return (
    <Form {...form}>
      <form
        className="flex max-h-[calc(100vh-120px)] flex-col gap-6 overflow-y-scroll px-1"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <TiptapEditorField label="Message" name="message" required />

        <SelectField
          label={t("fields.replyFormat.label")}
          name="replyFormat"
          options={replyFormatOptions}
          required
        />

        <CustomFieldField
          label={t("fields.outputCustomField.label")}
          name="outputCfId"
          required
        />

        <TiptapEditorField
          label={t("fields.retryMessage.label")}
          name="retryMessage"
        />

        <InputField
          label={t("fields.skipButtonLabel.label")}
          name="skipButtonLabel"
        />

        <SwitchField label={t("fields.autoSkip.label")} name="autoSkip" />

        {typeof autoSkip === "boolean" && autoSkip && (
          <>
            <div className="flex flex-col justify-between gap-2">
              <Label>{t("fields.autoSkipTime.label")}</Label>
              <div className="flex justify-between gap-2">
                <InputNumberField
                  max={100}
                  min={1}
                  name="autoSkipTimeValue"
                  required
                  stepper={1}
                />
                <DelayUnitSelect name="autoSkipTimeUnit" required />
              </div>
            </div>

            <InputNumberField
              label={t("fields.autoSkipFailAttempts.label")}
              max={100}
              min={1}
              name="autoSkipFailAttempts"
              required
              stepper={1}
            />
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button
            onClick={handleCancel}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button disabled={!form.formState.isValid} size="sm" type="submit">
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("actions.confirm")}
          </Button>
        </div>
      </form>
    </Form>
  )
}

const GetUserDataStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  return (
    <BaseStepEditor icon={KeyboardIcon} title={t("flows.actions.getUserData")}>
      <div className="flex flex-col gap-3">
        <InputField label="Message" name={`${parentName}.message`} required />

        <Dialog onOpenChange={setOpen} open={open}>
          <DialogTrigger asChild>
            <div className="flex justify-center">
              <Button size="sm" variant="outline">
                {t("actions.edit")}
              </Button>
            </div>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("flows.actions.getUserData")}</DialogTitle>
              <DialogDescription />
            </DialogHeader>

            <GetUserDataStepForm
              onCancel={() => setOpen(false)}
              onSuccess={() => setOpen(false)}
              parentName={parentName}
            />
          </DialogContent>
        </Dialog>
      </div>
    </BaseStepEditor>
  )
}

export default GetUserDataStepEditor
