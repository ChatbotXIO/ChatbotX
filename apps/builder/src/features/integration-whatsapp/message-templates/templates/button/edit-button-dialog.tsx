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
import { useTranslate } from "@tolgee/react"
import { useMemo } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { WhatsappFlowSelect } from "@/features/integration-whatsapp/flows/flow-select"
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
  const { t } = useTranslate()

  const { setValue: setValueOriginEditor, getValues: getValuesOriginEditor } =
    useFormContext()

  const form = useForm<ButtonStepSchema>({
    resolver: zodResolver(buttonStepSchema),
    defaultValues: getValuesOriginEditor(parentName),
    mode: "onChange",
  })

  const buttonOptions = useMemo(() => {
    return [
      { label: t("whatsapp.Button.url"), value: ButtonActionType.Url },
      { label: t("whatsapp.Button.flow"), value: ButtonActionType.QuickReply },
      {
        label: t("whatsapp.Button.phoneNumber"),
        value: ButtonActionType.PhoneNumber,
      },
      {
        label: t("whatsapp.Button.WhatsappFlow"),
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("common.edit")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form className="flex-1 space-y-4" onSubmit={onSubmit}>
            <InputField label={t("common.Button.label")} name="text" />
            {changeType && (
              <SelectField
                label={t("common.Button.whenPressed")}
                name="type"
                options={buttonOptions}
              />
            )}
            {type === ButtonActionType.Url && (
              <InputField label={t("common.link")} name="url" />
            )}
            {type === ButtonActionType.PhoneNumber && (
              <InputField
                label={t("flows.Button.phoneNumber")}
                name="phone_number"
              />
            )}
            {type === ButtonActionType.Flow && (
              <WhatsappFlowSelect label={"WhatsApp Flow"} name="flow_id" />
            )}
            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="secondary"
              >
                {t("common.cancelBtn")}
              </Button>
              <Button disabled={!formState.isValid} type="submit">
                {t("common.Btn")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
