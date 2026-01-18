"use client"

import {
  type KlaviyoStepSchema,
  klaviyoDefaultFn,
  klaviyoStepSchema,
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
import { useKlaviyoStore } from "@/features/integration-klaviyo/provider/klaviyo-store-context"
import { BaseStepEditor } from "../base/editor"

type KlaviyoStepFormProps = {
  parentName: string
  onSuccess?: () => void
  onCancel?: () => void
}

const KlaviyoStepForm = memo(
  ({ parentName, onSuccess, onCancel }: KlaviyoStepFormProps) => {
    const t = useTranslations()
    const { chatbotId } = useParams<{ chatbotId: string }>()
    const { getValues: getParentValues, setValue: setParentValue } =
      useFormContext()

    const form = useForm<KlaviyoStepSchema>({
      resolver: zodResolver(klaviyoStepSchema),
      defaultValues: getParentValues(parentName) ?? klaviyoDefaultFn(),
      mode: "onChange",
    })

    const lists = useKlaviyoStore((s) => s.lists)
    const fetchLists = useKlaviyoStore((s) => s.fetchLists)

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

    const onSubmit = (data: KlaviyoStepSchema) => {
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
            label={t("klaviyo.fields.list")}
            name="listId"
            options={listOptions}
            placeholder={t("klaviyo.fields.listPlaceholder")}
          />

          <CustomFieldSelect
            includeReserved={true}
            label={t("klaviyo.fields.emailField")}
            name="emailField"
            required
            tooltip={t("klaviyo.fields.emailFieldTooltip")}
          />

          <CustomFieldSelect
            includeReserved={true}
            label={t("klaviyo.fields.phoneField")}
            name="phoneField"
            placeholder={t("klaviyo.fields.phonePlaceholder")}
          />

          <CustomFieldSelect
            includeReserved={true}
            label={t("klaviyo.fields.titleField")}
            name="titleField"
            placeholder={t("klaviyo.fields.titlePlaceholder")}
          />

          <CustomFieldSelect
            includeReserved={true}
            label={t("klaviyo.fields.orgField")}
            name="orgField"
            placeholder={t("klaviyo.fields.orgPlaceholder")}
          />

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
KlaviyoStepForm.displayName = "KlaviyoStepForm"

const KlaviyoStepEditor = ({ parentName }: { parentName: string }) => {
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
    <BaseStepEditor icon={MailIcon} title={t("flows.actions.klaviyo")}>
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
              <DialogTitle>{t("klaviyo.title")}</DialogTitle>
              <DialogDescription />
            </DialogHeader>

            <KlaviyoStepForm
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

export default KlaviyoStepEditor
