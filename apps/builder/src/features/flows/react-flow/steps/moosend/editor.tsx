"use client"

import {
  type MoosendStepSchema,
  moosendDefaultFn,
  moosendStepSchema,
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
import {
  MoosendStoreProvider,
  useMoosendStore,
} from "@/features/integration-moosend/provider/moosend-store-context"
import { BaseStepEditor } from "../base/editor"

type MoosendStepFormProps = {
  parentName: string
  onSuccess?: () => void
  onCancel?: () => void
}

const MoosendStepForm = memo(
  ({ parentName, onSuccess, onCancel }: MoosendStepFormProps) => {
    const t = useTranslations()
    const { chatbotId } = useParams<{ chatbotId: string }>()
    const { getValues: getParentValues, setValue: setParentValue } =
      useFormContext()

    const form = useForm<MoosendStepSchema>({
      resolver: zodResolver(moosendStepSchema),
      defaultValues: getParentValues(parentName) ?? moosendDefaultFn(),
      mode: "onChange",
    })

    const lists = useMoosendStore((s) => s.lists)
    const fetchLists = useMoosendStore((s) => s.fetchLists)
    const error = useMoosendStore((s) => s.error)

    useEffect(() => {
      if (chatbotId) {
        fetchLists(chatbotId)
      }
    }, [chatbotId, fetchLists])

    const listOptions = useMemo(
      () => (lists ?? []).map((v) => ({ label: v.name, value: v.id })),
      [lists],
    )

    const handleCancel = () => {
      form.reset()
      onCancel?.()
    }

    const onSubmit = (data: MoosendStepSchema) => {
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
            label={t("moosend.fields.list")}
            name="listId"
            options={listOptions}
            required
          />

          <CustomFieldSelect
            includeReserved={true}
            label={t("moosend.fields.emailField")}
            name="emailField"
            required
          />

          <CustomFieldSelect
            includeReserved={true}
            label={t("moosend.fields.nameField")}
            name="nameField"
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
MoosendStepForm.displayName = "MoosendStepForm"

const MoosendStepEditor = ({ parentName }: { parentName: string }) => {
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
    <MoosendStoreProvider>
      <BaseStepEditor icon={MailIcon} title={t("flows.actions.moosend")}>
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
                <DialogTitle>{t("flows.actions.moosend")}</DialogTitle>
                <DialogDescription />
              </DialogHeader>

              <MoosendStepForm
                onCancel={handleCancel}
                onSuccess={handleSuccess}
                parentName={parentName}
              />
            </DialogContent>
          </Dialog>
        </div>
      </BaseStepEditor>
    </MoosendStoreProvider>
  )
}

export default MoosendStepEditor
