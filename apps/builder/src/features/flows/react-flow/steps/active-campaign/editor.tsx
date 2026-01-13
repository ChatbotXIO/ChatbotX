"use client"

import {
  ActiveCampaignOperation,
  type ActiveCampaignStepSchema,
  activeCampaignDefaultFn,
  activeCampaignStepSchema,
} from "@aha.chat/flow-config"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
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
import {
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useActiveCampaignStore } from "@/features/integration-active-campaign/provider/active-campaign-store-context"
import { BaseStepEditor } from "../base/editor"

type ActiveCampaignStepFormProps = {
  parentName: string
  onSuccess?: () => void
  onCancel?: () => void
}

const ActiveCampaignStepForm = memo(
  ({ parentName, onSuccess, onCancel }: ActiveCampaignStepFormProps) => {
    const t = useTranslations()
    const { chatbotId } = useParams<{ chatbotId: string }>()
    const { getValues: getParentValues, setValue: setParentValue } =
      useFormContext()

    const form = useForm<ActiveCampaignStepSchema>({
      resolver: zodResolver(activeCampaignStepSchema),
      defaultValues: getParentValues(parentName) ?? activeCampaignDefaultFn(),
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

    const operation = useWatch({
      control: form.control,
      name: "operation",
    })

    const lists = useActiveCampaignStore((s) => s.lists)
    const tags = useActiveCampaignStore((s) => s.tags)
    const fields = useActiveCampaignStore((s) => s.fields)
    const automations = useActiveCampaignStore((s) => s.automations)

    const fetchLists = useActiveCampaignStore((s) => s.fetchLists)
    const fetchTags = useActiveCampaignStore((s) => s.fetchTags)
    const fetchFields = useActiveCampaignStore((s) => s.fetchFields)
    const fetchAutomations = useActiveCampaignStore((s) => s.fetchAutomations)

    useEffect(() => {
      if (chatbotId) {
        if (operation === ActiveCampaignOperation.createOrUpdate) {
          fetchLists(chatbotId)
          fetchTags(chatbotId)
          fetchFields(chatbotId)
        } else if (operation === ActiveCampaignOperation.addToAutomation) {
          fetchAutomations(chatbotId)
        }
      }
    }, [
      chatbotId,
      operation,
      fetchLists,
      fetchTags,
      fetchFields,
      fetchAutomations,
    ])

    useEffect(() => {
      if (
        operation !== ActiveCampaignOperation.createOrUpdate ||
        fields.length === 0
      ) {
        return
      }

      const currentFields = form.getValues("mergeFields") ?? []

      if (currentFields.length === 0) {
        replace(
          fields.map((field) => ({
            chatbotField: "",
            activeCampaignField: field.title,
          })),
        )
      }
    }, [operation, fields, form, replace])

    const operationOptions = [
      {
        label: t("activeCampaign.operations.createOrUpdate"),
        value: ActiveCampaignOperation.createOrUpdate,
      },
      {
        label: t("activeCampaign.operations.addToAutomation"),
        value: ActiveCampaignOperation.addToAutomation,
      },
    ]

    const listOptions = useMemo(
      () => (lists ?? []).map((v) => ({ label: v.name, value: v.id })),
      [lists],
    )

    const tagOptions = useMemo(
      () => (tags ?? []).map((v) => ({ label: v.tag, value: v.tag })),
      [tags],
    )

    const automationOptions = useMemo(
      () => (automations ?? []).map((v) => ({ label: v.name, value: v.id })),
      [automations],
    )

    const handleCancel = () => {
      form.reset()
      onCancel?.()
    }

    const onSubmit = (data: ActiveCampaignStepSchema) => {
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
            label={t("activeCampaign.fields.operation")}
            name="operation"
            options={operationOptions}
            required
          />

          <CustomFieldSelect
            includeReserved={true}
            label={t("activeCampaign.fields.emailField")}
            name="emailField"
            required
            tooltip={t("activeCampaign.fields.emailFieldTooltip")}
          />

          {operation === ActiveCampaignOperation.createOrUpdate && (
            <>
              <CustomFieldSelect
                includeReserved={true}
                label={t("activeCampaign.fields.phoneField")}
                name="phoneField"
              />

              <ComboboxField
                label={t("activeCampaign.fields.list")}
                name="listId"
                options={listOptions}
                placeholder={t("activeCampaign.fields.listPlaceholder")}
              />

              <MultiSelectField
                label={t("activeCampaign.fields.tags")}
                name="tags"
                options={tagOptions}
                placeholder={t("activeCampaign.fields.tagsPlaceholder")}
              />

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-sm">
                      {t("activeCampaign.fields.customFieldsMapping")}
                    </span>
                    <span className="self-start font-normal text-xxs">
                      (optional)
                    </span>
                  </div>
                </div>
                {mappingFields.map((field, index) => (
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
                      <InputField
                        disabled
                        name={`mergeFields.${index}.activeCampaignField`}
                      />
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
                ))}
              </div>
            </>
          )}

          {operation === ActiveCampaignOperation.addToAutomation && (
            <ComboboxField
              label={t("activeCampaign.fields.automation")}
              name="automationId"
              options={automationOptions}
              placeholder={t("activeCampaign.fields.automationPlaceholder")}
              required
            />
          )}

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
ActiveCampaignStepForm.displayName = "ActiveCampaignStepForm"

const ActiveCampaignStepEditor = ({ parentName }: { parentName: string }) => {
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
    <BaseStepEditor icon={MailIcon} title={t("flows.actions.activeCampaign")}>
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
              <DialogTitle>{t("flows.actions.activeCampaign")}</DialogTitle>
              <DialogDescription />
            </DialogHeader>

            <ActiveCampaignStepForm
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

export default ActiveCampaignStepEditor
