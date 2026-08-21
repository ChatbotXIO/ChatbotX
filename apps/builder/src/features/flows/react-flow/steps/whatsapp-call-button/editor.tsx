"use client"

import {
  WHATSAPP_CALL_BUTTON_LABEL_MAX,
  type WhatsappCallButtonLabelFormValues,
  whatsappCallButtonLabelFormSchema,
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
import { PhoneIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { memo, useState } from "react"
import {
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"

type WhatsappCallButtonStepEditorProps = {
  parentName: string
}

type ButtonLabelDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentLabel: string
  onSave: (values: WhatsappCallButtonLabelFormValues) => void
}

function CallButtonLabelDialogInner({
  open,
  onOpenChange,
  currentLabel,
  onSave,
}: ButtonLabelDialogProps) {
  const t = useTranslations()

  const form = useForm<WhatsappCallButtonLabelFormValues>({
    resolver: zodResolver(whatsappCallButtonLabelFormSchema),
    defaultValues: { buttonLabel: currentLabel },
    values: { buttonLabel: currentLabel },
    mode: "onChange",
  })

  const onSubmit = (values: WhatsappCallButtonLabelFormValues) => {
    onSave(values)
    onOpenChange(false)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("flows.whatsappCallButton.editButtonTitle")}
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
              label={t("flows.whatsappCallButton.buttonLabel")}
              maxLength={WHATSAPP_CALL_BUTTON_LABEL_MAX}
              name="buttonLabel"
              required
            />
            <DialogFooter>
              <DialogClose
                render={
                  <Button size="sm" type="button" variant="ghost">
                    {t("actions.cancel")}
                  </Button>
                }
              />
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

const CallButtonLabelDialog = memo(CallButtonLabelDialogInner)

const WhatsappCallButtonStepEditor = ({
  parentName,
}: WhatsappCallButtonStepEditorProps) => {
  const { control, setValue } = useFormContext()
  const buttonLabel = useWatch({
    control,
    name: `${parentName}.buttonLabel`,
  }) as string

  const [labelDialogOpen, setLabelDialogOpen] = useState(false)

  const handleSaveLabel = (values: WhatsappCallButtonLabelFormValues) => {
    setValue(`${parentName}.buttonLabel`, values.buttonLabel, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg">
      <div className="bg-secondary px-4 py-2">
        <TiptapEditorField name={`${parentName}.text`} />
      </div>

      <div className="bg-slate-200 px-3 py-2 dark:bg-neutral-900">
        <Button
          className="w-full justify-center gap-1.5"
          onClick={() => setLabelDialogOpen(true)}
          type="button"
          variant="outline"
        >
          <PhoneIcon className="size-4" />
          <span className="truncate">{buttonLabel}</span>
        </Button>
      </div>

      <CallButtonLabelDialog
        currentLabel={buttonLabel}
        onOpenChange={setLabelDialogOpen}
        onSave={handleSaveLabel}
        open={labelDialogOpen}
      />
    </div>
  )
}

export default WhatsappCallButtonStepEditor
