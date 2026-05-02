"use client"

import {
  WHATSAPP_OPTION_LIST_BUTTON_MAX,
  type WhatsappOptionListButtonLabelFormValues,
  whatsappOptionListButtonLabelFormSchema,
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
} from "@chatbotx.io/ui/components/ui/dialog"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { memo } from "react"
import { FormProvider, useForm } from "react-hook-form"

type ButtonLabelDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentLabel: string
  onSave: (values: WhatsappOptionListButtonLabelFormValues) => void
}

function ButtonLabelDialogInner({
  open,
  onOpenChange,
  currentLabel,
  onSave,
}: ButtonLabelDialogProps) {
  const t = useTranslations()

  const form = useForm<WhatsappOptionListButtonLabelFormValues>({
    resolver: zodResolver(whatsappOptionListButtonLabelFormSchema),
    defaultValues: { buttonLabel: currentLabel },
    values: { buttonLabel: currentLabel },
    mode: "onChange",
  })

  const onSubmit = (values: WhatsappOptionListButtonLabelFormValues) => {
    onSave(values)
    onOpenChange(false)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("flows.whatsappOptionList.editButtonTitle")}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <FormProvider {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              form.handleSubmit(onSubmit)(e)
            }}
          >
            <InputField
              label={t("flows.whatsappOptionList.buttonLabel")}
              maxLength={WHATSAPP_OPTION_LIST_BUTTON_MAX}
              name="buttonLabel"
              required
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button size="sm" type="button" variant="ghost">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>
              <Button
                disabled={!form.formState.isValid}
                size="sm"
                type="submit"
              >
                {t("actions.continue")}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}

export const ButtonLabelDialog = memo(ButtonLabelDialogInner)
