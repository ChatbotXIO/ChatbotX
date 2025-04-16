"use client"

import { InputField } from "@/components/form/input-field"
import { SelectField } from "@/components/form/select-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { FlowSelect } from "@/features/integration-whatsapp/flows/flow-select"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslate } from "@tolgee/react"
import { useMemo } from "react"
import { useForm, useFormContext } from "react-hook-form"
import {
  ButtonActionType,
  buttonBlockSchema,
  type ButtonBlockSchema,
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

  const form = useForm<ButtonBlockSchema>({
    resolver: zodResolver(buttonBlockSchema),
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

  const { watch, formState, getValues } = form
  const type = watch("type")

  const onSave = () => {
    setValueOriginEditor(parentName, getValues())
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("common.edit")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <div className="flex-1 space-y-4">
              <InputField name="text" label={t("common.Button.label")} />
              {changeType && (
                <SelectField
                  name="type"
                  label={t("common.Button.whenPressed")}
                  options={buttonOptions}
                />
              )}
              {type === ButtonActionType.Url && (
                <InputField name="url" label={t("common.link")} />
              )}
              {type === ButtonActionType.PhoneNumber && (
                <InputField
                  name="phone_number"
                  label={t("flows.Button.phoneNumber")}
                />
              )}
              {type === ButtonActionType.Flow && (
                <FlowSelect name="flow_id" label={"WhatsApp Flow"} />
              )}
            </div>
          </Form>
        </div>
        <DialogFooter>
          <Button
            aria-label="Cancel button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancelBtn")}
          </Button>
          <Button
            aria-label="Save button"
            onClick={onSave}
            disabled={!formState.isValid}
          >
            {t("common.Btn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
