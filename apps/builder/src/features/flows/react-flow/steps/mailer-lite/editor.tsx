"use client"

import {
  type MailerLiteStepSchema,
  mailerLiteDefaultFn,
  mailerLiteStepSchema,
} from "@aha.chat/flow-config"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
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
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRightIcon, Loader2Icon, MailIcon, TrashIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { useFieldArray, useForm, useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useMailerLiteStore } from "@/features/integration-mailer-lite/provider/mailer-lite-store-context"
import { BaseStepEditor } from "../base/editor"

type MailerLiteStepFormProps = {
  parentName: string
  onSuccess?: () => void
  onCancel?: () => void
}

const MailerLiteStepForm = memo(
  ({ parentName, onSuccess, onCancel }: MailerLiteStepFormProps) => {
    const t = useTranslations()
    const { chatbotId } = useParams<{ chatbotId: string }>()
    const { getValues: getParentValues, setValue: setParentValue } =
      useFormContext()

    const form = useForm<MailerLiteStepSchema>({
      resolver: zodResolver(mailerLiteStepSchema),
      defaultValues: getParentValues(parentName) ?? mailerLiteDefaultFn(),
      mode: "onChange",
    })

    const {
      fields: mappingFields,
      remove,
      replace,
    } = useFieldArray({
      control: form.control,
      name: "mergeFields" as const,
    })

    const groups = useMailerLiteStore((s) => s.groups)
    const fields = useMailerLiteStore((s) => s.fields)
    const loadingFields = useMailerLiteStore((s) => s.loadingFields)
    const error = useMailerLiteStore((s) => s.error)

    const fetchGroups = useMailerLiteStore((s) => s.fetchGroups)
    const fetchFields = useMailerLiteStore((s) => s.fetchFields)

    useEffect(() => {
      if (fields.length === 0) {
        return
      }

      const currentMergeFields = form.getValues("mergeFields")

      // Skip default fields that are handled separately
      const availableFields = fields.filter(
        (f) => !["name", "last_name", "phone"].includes(f.id),
      )

      if (!currentMergeFields || currentMergeFields.length === 0) {
        replace(
          availableFields.map((f) => ({
            chatbotField: "",
            mailerLiteField: f.id,
          })),
        )
      }
    }, [fields, form, replace])

    useEffect(() => {
      if (chatbotId) {
        fetchGroups(chatbotId)
        fetchFields(chatbotId)
      }
    }, [chatbotId, fetchGroups, fetchFields])

    const groupOptions = useMemo(
      () => (groups ?? []).map((v) => ({ label: v.name, value: v.id })),
      [groups],
    )

    const typeOptions = [
      { label: t("mailerlite.fields.types.active"), value: "active" },
      { label: t("mailerlite.fields.types.unconfirmed"), value: "unconfirmed" },
    ]

    const handleCancel = () => {
      form.reset()
      onCancel?.()
    }

    const onSubmit = (data: MailerLiteStepSchema) => {
      // Filter out empty chatbotField mappings
      const filteredMergeFields = (data.mergeFields || []).filter(
        (m) => m.chatbotField && m.chatbotField.trim() !== "",
      )

      // Clean up groupId (convert empty string to undefined)
      const cleanedData: MailerLiteStepSchema = {
        ...data,
        groupId:
          data.groupId && data.groupId.trim() !== "" ? data.groupId : undefined,
        mergeFields:
          filteredMergeFields.length > 0 ? filteredMergeFields : undefined,
      }

      // DEBUG: Log cleaned data
      console.log("[MailerLite Editor] Cleaned data to save:", {
        groupId: cleanedData.groupId,
        mergeFields: cleanedData.mergeFields,
        emailField: cleanedData.emailField,
      })

      setParentValue(parentName, cleanedData)
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
            label={t("mailerlite.fields.group")}
            name="groupId"
            options={groupOptions}
            placeholder={t("mailerlite.fields.groupPlaceholder")}
          />

          <CustomFieldSelect
            includeReserved={true}
            label={t("mailerlite.fields.emailField")}
            name="emailField"
            required
            tooltip={t("mailerlite.fields.emailFieldTooltip")}
          />

          <SwitchField
            description={t("mailerlite.fields.autorespondersTooltip")}
            label={t("mailerlite.fields.autoresponders")}
            name="autoresponders"
          />

          <SelectField
            label={t("mailerlite.fields.type")}
            name="type"
            options={typeOptions}
          />

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="font-medium text-sm">
                  {t("mailerlite.fields.customFieldsMapping")}
                </span>
                <span className="self-start font-normal text-xxs">
                  (optional)
                </span>
              </div>
            </div>
            {loadingFields ? (
              <div className="flex items-center justify-center p-4">
                <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              mappingFields.map((field, index) => (
                <div className="flex items-center gap-2" key={field.id}>
                  <div className="flex-1">
                    <CustomFieldSelect
                      allowClear={true}
                      includeReserved={true}
                      label=""
                      name={`mergeFields.${index}.chatbotField`}
                      placeholder="---"
                    />
                  </div>
                  <ArrowRightIcon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="flex h-10 w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-input bg-muted/50 px-3 py-2 text-muted-foreground text-sm">
                      {fields.find((f) => f.id === field.mailerLiteField)
                        ?.name || field.mailerLiteField}
                    </div>
                  </div>
                  <Button
                    className="h-8 w-8 p-0"
                    onClick={() => remove(index)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
            {error && !loadingFields && (
              <div className="text-destructive text-sm">{t(error)}</div>
            )}
          </div>

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
MailerLiteStepForm.displayName = "MailerLiteStepForm"

const MailerLiteStepEditor = ({ parentName }: { parentName: string }) => {
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
    <BaseStepEditor icon={MailIcon} title={t("flows.actions.mailerlite")}>
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
              <DialogTitle>{t("flows.actions.mailerlite")}</DialogTitle>
              <DialogDescription />
            </DialogHeader>

            <MailerLiteStepForm
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

export default MailerLiteStepEditor
