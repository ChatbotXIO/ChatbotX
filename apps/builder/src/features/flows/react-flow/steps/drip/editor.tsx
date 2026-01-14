"use client"

import {
  type DripStepSchema,
  dripDefaultFn,
  dripStepSchema,
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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useDripStore } from "@/features/integration-drip/provider/drip-store-context"
import { BaseStepEditor } from "../base/editor"

type DripStepFormProps = {
  parentName: string
  onSuccess?: () => void
  onCancel?: () => void
}

const DripStepForm = memo(
  ({ parentName, onSuccess, onCancel }: DripStepFormProps) => {
    const t = useTranslations()
    const { chatbotId } = useParams<{ chatbotId: string }>()
    const { getValues: getParentValues, setValue: setParentValue } =
      useFormContext()

    const form = useForm<DripStepSchema>({
      resolver: zodResolver(dripStepSchema),
      defaultValues: getParentValues(parentName) ?? dripDefaultFn(),
      mode: "onChange",
    })

    const {
      fields: mappingFields,
      remove,
      append,
    } = useFieldArray({
      control: form.control,
      name: "mergeFields" as const,
    })

    const accountId = useWatch({
      control: form.control,
      name: "accountId",
    })

    const accounts = useDripStore((s) => s.accounts)
    const tags = useDripStore((s) => s.tags)
    const fields = useDripStore((s) => s.fields)
    const loadingFields = useDripStore((s) => s.loadingFields)
    const error = useDripStore((s) => s.error)

    const fetchAccounts = useDripStore((s) => s.fetchAccounts)
    const fetchTags = useDripStore((s) => s.fetchTags)
    const fetchFields = useDripStore((s) => s.fetchFields)

    const lastAutoAppendedAccountId = useRef<string | null>(null)
    const isNewNode = useRef(!getParentValues(parentName)?.accountId)

    const autoAppend = useCallback(() => {
      if (
        !accountId ||
        fields.length === 0 ||
        !isNewNode.current ||
        lastAutoAppendedAccountId.current === accountId
      ) {
        return
      }

      // Check if mergeFields already has data to be safe (except for our own appended fields)
      const currentMergeFields = form.getValues().mergeFields
      if (
        lastAutoAppendedAccountId.current === null &&
        currentMergeFields &&
        currentMergeFields.length > 0
      ) {
        lastAutoAppendedAccountId.current = accountId
        return
      }

      for (const field of fields) {
        append({
          chatbotField: "",
          dripField: field.identifier,
        })
      }
      lastAutoAppendedAccountId.current = accountId
    }, [accountId, fields, append, form])

    useEffect(() => {
      if (chatbotId) {
        fetchAccounts(chatbotId)
      }
    }, [chatbotId, fetchAccounts])

    useEffect(() => {
      if (chatbotId && accountId) {
        fetchTags(chatbotId)
        fetchFields(chatbotId)
      }
    }, [chatbotId, accountId, fetchTags, fetchFields])

    useEffect(() => {
      autoAppend()
    }, [autoAppend])

    const accountOptions = useMemo(
      () => (accounts ?? []).map((v) => ({ label: v.name, value: v.id })),
      [accounts],
    )

    const tagOptions = useMemo(
      () => (tags ?? []).map((v) => ({ label: v, value: v })),
      [tags],
    )

    const handleCancel = () => {
      form.reset()
      onCancel?.()
    }

    const onSubmit = (data: DripStepSchema) => {
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
            label={t("drip.fields.account")}
            name="accountId"
            options={accountOptions}
            required
          />

          {accountId && (
            <>
              <CustomFieldSelect
                includeReserved={true}
                label={t("drip.fields.emailField")}
                name="emailField"
                required
                tooltip={t("drip.fields.emailFieldTooltip")}
              />

              <CustomFieldSelect
                includeReserved={true}
                label={t("drip.fields.phoneField")}
                name="phoneField"
                placeholder="---"
              />

              <MultiSelectField
                label={t("drip.fields.tags")}
                name="tags"
                options={tagOptions}
                placeholder={t("drip.fields.tagsPlaceholder")}
              />

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-sm">
                      {t("drip.fields.customFieldsMapping")}
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
                        <InputField
                          disabled
                          name={`mergeFields.${index}.dripField`}
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
                  ))
                )}
                {error && !loadingFields && (
                  <div className="text-destructive text-sm">{t(error)}</div>
                )}
              </div>
            </>
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
DripStepForm.displayName = "DripStepForm"

const DripStepEditor = ({ parentName }: { parentName: string }) => {
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
    <BaseStepEditor icon={MailIcon} title={t("flows.actions.drip")}>
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
              <DialogTitle>{t("flows.actions.drip")}</DialogTitle>
              <DialogDescription />
            </DialogHeader>

            <DripStepForm
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

export default DripStepEditor
