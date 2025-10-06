"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useForm, useFormContext } from "react-hook-form"
import {
  ButtonActionType,
  type ButtonStepSchema,
  buttonStepSchema,
} from "./schema"

export function EditButtonDialog({
  parentName,
  open,
  onOpenChange,
  changeType = true,
}: {
  parentName: string
  open: boolean
  onOpenChange: (val: boolean) => void
  changeType?: boolean
}) {
  const t = useTranslations()

  const { setValue: setValueOriginEditor, getValues: getValuesOriginEditor } =
    useFormContext()

  const form = useForm<ButtonStepSchema>({
    resolver: zodResolver(buttonStepSchema),
    defaultValues: getValuesOriginEditor(parentName),
    mode: "onChange",
  })

  const buttonOptions = useMemo(() => {
    return [
      { label: t("fields.url.label"), value: ButtonActionType.Url },
      {
        label: t("fields.quickReply.label"),
        value: ButtonActionType.QuickReply,
      },
      {
        label: t("fields.phoneNumber.label"),
        value: ButtonActionType.PhoneNumber,
      },
      {
        label: t("fields.whatsappFlow.label"),
        value: ButtonActionType.Flow,
      },
    ]
  }, [t])

  const { watch, formState, handleSubmit } = form
  const type = watch("type")

  const onSubmit = handleSubmit((data) => {
    setValueOriginEditor(parentName, data)
    onOpenChange(false)
  })

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("dialog.updateTitle", { feature: t("fields.button.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form className="flex-1 space-y-4" onSubmit={onSubmit}>
            <InputField label={t("fields.text.label")} name="text" />
            {changeType && (
              <SelectField
                label={t("fields.button.whenPressed")}
                name="type"
                options={buttonOptions}
              />
            )}
            {type === ButtonActionType.Url && (
              <InputField label={t("fields.url.label")} name="url" />
            )}
            {type === ButtonActionType.PhoneNumber && (
              <InputField
                label={t("fields.phoneNumber.label")}
                name="phone_number"
              />
            )}
            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="secondary"
              >
                {t("actions.cancel")}
              </Button>
              <Button disabled={!formState.isValid} type="submit">
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
