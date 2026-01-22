"use client"

import {
  type SendFoxStepSchema,
  sendFoxDefaultFn,
  sendFoxStepSchema,
} from "@aha.chat/flow-config"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
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
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon, MailIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useSendFoxStore } from "@/features/integration-send-fox/provider/send-fox-store-context"
import { BaseStepEditor } from "../base/editor"

type SendFoxStepFormProps = {
  parentName: string
  onSuccess?: () => void
  onCancel?: () => void
}

const SendFoxStepForm = memo(
  ({ parentName, onSuccess, onCancel }: SendFoxStepFormProps) => {
    const t = useTranslations()
    const { chatbotId } = useParams<{ chatbotId: string }>()
    const { getValues: getParentValues, setValue: setParentValue } =
      useFormContext()

    const form = useForm<SendFoxStepSchema>({
      resolver: zodResolver(sendFoxStepSchema),
      defaultValues: getParentValues(parentName) ?? sendFoxDefaultFn(),
      mode: "onChange",
    })

    const lists = useSendFoxStore((s) => s.lists)
    const fetchLists = useSendFoxStore((s) => s.fetchLists)
    const error = useSendFoxStore((s) => s.error)

    useEffect(() => {
      if (chatbotId) {
        fetchLists(chatbotId)
      }
    }, [chatbotId, fetchLists])

    const listOptions = useMemo(
      () =>
        (lists ?? []).map((v) => ({ label: v.name, value: v.id.toString() })),
      [lists],
    )

    const handleCancel = () => {
      form.reset()
      onCancel?.()
    }

    const onSubmit = (data: SendFoxStepSchema) => {
      setParentValue(parentName, data)
      onSuccess?.()
    }

    return (
      <Form {...form}>
        <form
          className="flex flex-col gap-6"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <ComboboxField
            contentClassName="w-[var(--radix-popover-trigger-width)]"
            label={t("sendFox.fields.list")}
            name="listId"
            options={listOptions}
            required
          />

          <CustomFieldSelect
            includeReserved={true}
            label={t("sendFox.fields.emailField")}
            name="emailField"
            required
          />

          {error && <div className="text-destructive text-sm">{t(error)}</div>}

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
  },
)
SendFoxStepForm.displayName = "SendFoxStepForm"

const SendFoxStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const handleOpenChange = useCallback((v: boolean) => {
    setOpen(v)
  }, [])

  const handleSuccess = useCallback(() => {
    setOpen(false)
  }, [])

  const handleCancel = useCallback(() => {
    setOpen(false)
  }, [])

  return (
    <BaseStepEditor icon={MailIcon} title={t("flows.actions.sendFox")}>
      <div className="flex flex-col gap-3">
        <Dialog onOpenChange={handleOpenChange} open={open}>
          <DialogTrigger asChild>
            <div className="flex justify-center">
              <Button size="sm" variant="outline">
                {t("actions.edit")}
              </Button>
            </div>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("flows.actions.sendFox")}</DialogTitle>
              <DialogDescription />
            </DialogHeader>

            <SendFoxStepForm
              onCancel={handleCancel}
              onSuccess={handleSuccess}
              parentName={parentName}
            />
          </DialogContent>
        </Dialog>
      </div>
    </BaseStepEditor>
  )
}

export default SendFoxStepEditor
