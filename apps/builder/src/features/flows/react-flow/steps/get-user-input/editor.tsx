"use client"

import {
  type GetUserInputStepSchema,
  getUserInputStepDefaultFn,
  getUserInputStepSchema,
  ReplyFormat,
} from "@aha.chat/flow-config"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { InputNumberField } from "@aha.chat/ui/components/form/input-number-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { SwitchField } from "@aha.chat/ui/components/form/switch-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
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
import { ClockIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { useForm, useFormContext, useWatch } from "react-hook-form"
import { useStepStore } from "../../stores/step-store-provider"
import { BaseStepEditor } from "../base/editor"
import DelayUnitSelect from "../wait/components/delay-unit-select"

type GetUserInputStepFormProps = {
  parentName: string
  onSuccess?: () => void
  onCancel?: () => void
}

const GetUserInputStepForm = ({
  parentName,
  onSuccess,
  onCancel,
}: GetUserInputStepFormProps) => {
  const t = useTranslations()

  const { getValues: getParentValues, setValue: setParentValue } =
    useFormContext()

  const form = useForm<GetUserInputStepSchema>({
    resolver: zodResolver(getUserInputStepSchema),
    defaultValues: getUserInputStepDefaultFn(),
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

  const customFieldOptions = useStepStore((state) => state.customFieldOptions)

  const autoSkip = useWatch({ name: "autoSkip" })

  const handleCancel = () => {
    form.reset()
    onCancel?.()
  }

  const onSubmit = (data: GetUserInputStepSchema) => {
    setParentValue(parentName, data)
    onSuccess?.()
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <InputField label="Message" name="message" required />
        <SelectField
          label="Reply Format"
          name="replyFormat"
          options={replyFormatOptions}
          required
        />
        <SelectField
          label="Output CF ID"
          name="outputCfId"
          options={customFieldOptions}
          required
        />
        <TextareaField label="Retry Message" name="retryMessage" rows={3} />
        <InputField label="Skip Button Label" name="skipButtonLabel" />
        <SwitchField label="Auto Skip" name="autoSkip" />
        {typeof autoSkip === "boolean" && autoSkip && (
          <>
            <div className="flex flex-col justify-between gap-2">
              <Label>Auto Skip Time</Label>
              <div className="flex justify-between gap-2">
                <InputNumberField
                  max={100}
                  min={1}
                  name="autoSkipTimeValue"
                  required
                  step={1}
                />
                <DelayUnitSelect name="autoSkipTimeUnit" required />
              </div>
            </div>
            <InputNumberField
              label="Auto Skip Fail Attempts"
              max={100}
              min={1}
              name="autoSkipFailAttempts"
              required
              step={1}
            />
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button onClick={handleCancel} type="button" variant="outline">
            {t("actions.cancel")}
          </Button>
          <Button disabled={!form.formState.isValid} type="submit">
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </Form>
  )
}

const GetUserInputStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  return (
    <BaseStepEditor icon={ClockIcon} title={t("flows.actions.getUserInput")}>
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
              <DialogTitle>{t("flows.actions.getUserInput")}</DialogTitle>
              <DialogDescription />
            </DialogHeader>

            <GetUserInputStepForm
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

export default GetUserInputStepEditor
