"use client"

import {
  type DripSubscribeSubscriberSchema,
  dripSubscribeSubscriberSchema,
} from "@chatbotx.io/flow-config"
import type {
  DripAccount,
  DripCustomField,
} from "@chatbotx.io/integration-drip"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArrowRightIcon,
  CircleHelpIcon,
  MailIcon,
  PlusIcon,
  XIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import {
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useWorkspaceId } from "@/hooks/routing"
import { callAPI } from "@/lib/swr"
import { BaseStepEditor } from "../base/editor"

const FieldLabel = (props: {
  label: string
  optionalLabel?: string
  tooltip?: string
}) => (
  <div className="flex items-center gap-1">
    <span className="font-medium text-sm">{props.label}</span>
    {props.optionalLabel && (
      <span className="text-muted-foreground text-xs">
        ({props.optionalLabel})
      </span>
    )}
    {props.tooltip && (
      <span title={props.tooltip}>
        <CircleHelpIcon className="size-4 text-muted-foreground" />
      </span>
    )}
  </div>
)

const DripDialog = ({ parentName }: { parentName: string }) => {
  const [open, setOpen] = useState(false)
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { getValues, setValue } = useFormContext()

  const form = useForm<DripSubscribeSubscriberSchema>({
    resolver: zodResolver(dripSubscribeSubscriberSchema),
    defaultValues: { ...getValues(parentName) },
    mode: "onChange",
  })

  const {
    fields: mergeFields,
    append,
    remove,
  } = useFieldArray({
    control: form.control,
    name: "mergeFields",
  })
  const accountId = useWatch({ control: form.control, name: "accountId" })

  const {
    data: accountsResponse,
    error: accountsError,
    isLoading: accountsLoading,
  } = callAPI<{ data: DripAccount[] }>(
    `/api/workspaces/${workspaceId}/drip/accounts`,
  )
  const {
    data: tagsResponse,
    error: tagsError,
    isLoading: tagsLoading,
  } = callAPI<{ data: string[] }>(
    accountId
      ? `/api/workspaces/${workspaceId}/drip/tags?accountId=${encodeURIComponent(accountId)}`
      : null,
  )

  const {
    data: customFieldsResponse,
    error: customFieldsError,
    isLoading: customFieldsLoading,
  } = callAPI<{ data: DripCustomField[] }>(
    accountId
      ? `/api/workspaces/${workspaceId}/drip/custom-fields?accountId=${encodeURIComponent(accountId)}`
      : null,
  )

  const accountOptions = useMemo(
    () =>
      (accountsResponse?.data ?? []).map((account) => ({
        label: account.name || account.id,
        value: account.id,
      })),
    [accountsResponse],
  )
  const tagOptions = useMemo(
    () => (tagsResponse?.data ?? []).map((tag) => ({ label: tag, value: tag })),
    [tagsResponse],
  )

  const customFieldOptions = useMemo(
    () =>
      (customFieldsResponse?.data ?? []).map((f) => ({
        label: f.label,
        value: f.identifier,
      })),
    [customFieldsResponse],
  )

  const submit = (data: DripSubscribeSubscriberSchema) => {
    setValue(parentName, data)
    setOpen(false)
  }
  const onChangeAccount = () => {
    form.setValue("tags", [])
    form.setValue("mergeFields", [])
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            {t("actions.edit")}
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("drip.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(submit)}
          >
            <ComboboxField
              emptyText={t("actions.noRecordFound")}
              label={t("drip.fields.account")}
              name="accountId"
              options={accountOptions}
              placeholder={t("drip.fields.nothingSelected")}
              required
              triggerValueChange={onChangeAccount}
            />
            {accountsLoading && (
              <p className="text-muted-foreground text-sm">
                {t("drip.accounts.loading")}
              </p>
            )}
            {accountsError && (
              <p className="text-destructive text-sm">
                {t("drip.accounts.error")}
              </p>
            )}
            {accountId && (
              <>
                <div className="space-y-2">
                  <FieldLabel
                    label={t("drip.fields.emailField")}
                    tooltip={t("drip.fields.emailTooltip")}
                  />
                  <CustomFieldSelect
                    includeReserved
                    label=""
                    name="emailField"
                    placeholder={t("drip.fields.nothingSelected")}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel
                    label={t("drip.fields.phone")}
                    optionalLabel={t("drip.fields.optional")}
                  />
                  <CustomFieldSelect
                    includeReserved
                    label=""
                    name="phoneField"
                    placeholder={t("drip.fields.nothingSelected")}
                  />
                </div>
                {tagsLoading && (
                  <p className="text-muted-foreground text-sm">
                    {t("drip.tags.loading")}
                  </p>
                )}
                {tagsError && (
                  <p className="text-destructive text-sm">
                    {t("drip.tags.error")}
                  </p>
                )}
                {!(tagsLoading || tagsError) && (
                  <div className="space-y-2">
                    <FieldLabel
                      label={t("drip.fields.tags")}
                      optionalLabel={t("drip.fields.optional")}
                    />
                    <MultiSelectField
                      label=""
                      name="tags"
                      options={tagOptions}
                      placeholder={t("drip.fields.nothingSelected")}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <FieldLabel
                    label={t("drip.fields.customFields")}
                    optionalLabel={t("drip.fields.optional")}
                  />
                  {customFieldsLoading && (
                    <p className="text-muted-foreground text-sm">
                      {t("drip.customFields.loading")}
                    </p>
                  )}
                  {customFieldsError && (
                    <p className="text-destructive text-sm">
                      {t("drip.customFields.error")}
                    </p>
                  )}
                  {mergeFields.map((field, index) => (
                    <div
                      className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3"
                      key={field.id}
                    >
                      <CustomFieldSelect
                        includeReserved
                        label=""
                        name={`mergeFields.${index}.contactFieldId`}
                        placeholder={t("drip.fields.nothingSelected")}
                      />
                      <ArrowRightIcon className="size-4 text-muted-foreground rtl:rotate-180" />
                      <ComboboxField
                        emptyText={t("actions.noRecordFound")}
                        label=""
                        name={`mergeFields.${index}.dripField`}
                        options={customFieldOptions}
                        placeholder={t("drip.fields.nothingSelected")}
                      />
                      <Button
                        aria-label={t("actions.remove")}
                        onClick={() => remove(index)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <XIcon className="size-4" />
                      </Button>
                    </div>
                  ))}
                  {customFieldOptions.length > 0 && (
                    <Button
                      onClick={() =>
                        append({ contactFieldId: "", dripField: "" })
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <PlusIcon className="size-4" />
                      {t("drip.fields.addCustomField")}
                    </Button>
                  )}
                </div>
              </>
            )}
            <DialogFooter>
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="secondary"
              >
                {t("actions.cancel")}
              </Button>
              <Button disabled={!form.formState.isValid} type="submit">
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default function DripSubscribeSubscriberEditor(props: {
  parentName: string
}) {
  const t = useTranslations()
  return (
    <BaseStepEditor
      icon={MailIcon}
      title={t("flows.actions.dripSubscribeSubscriber")}
    >
      <DripDialog parentName={props.parentName} />
    </BaseStepEditor>
  )
}
