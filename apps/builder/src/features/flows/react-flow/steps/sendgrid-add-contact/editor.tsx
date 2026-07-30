"use client"

import {
  type SendGridAddContactSchema,
  sendGridAddContactSchema,
} from "@chatbotx.io/flow-config"
import type {
  SendGridCustomField,
  SendGridList,
  SendGridListPage,
} from "@chatbotx.io/integration-sendgrid"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
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
import ky from "ky"
import {
  ArrowRightIcon,
  CircleHelpIcon,
  MailIcon,
  PlusIcon,
  XIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useFieldArray, useForm, useFormContext } from "react-hook-form"
import useSWRImmutable from "swr/immutable"
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

const SendGridDialog = ({ parentName }: { parentName: string }) => {
  const [open, setOpen] = useState(false)
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { getValues, setValue } = useFormContext()
  const form = useForm<SendGridAddContactSchema>({
    resolver: zodResolver(sendGridAddContactSchema),
    defaultValues: { ...getValues(parentName) },
    mode: "onChange",
  })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "mergeFields",
  })
  const {
    data: allListItems,
    isLoading: listsLoading,
    error: listsError,
  } = useSWRImmutable<SendGridList[]>(
    workspaceId ? `sendgrid-lists-all-${workspaceId}` : null,
    async () => {
      const all: SendGridList[] = []
      const seen = new Set<string>()
      let pageToken: string | undefined
      for (let page = 0; page < 10; page++) {
        const params = new URLSearchParams({ pageSize: "1000" })
        if (pageToken) {
          params.set("pageToken", pageToken)
        }
        const data = await ky
          .get(`/api/workspaces/${workspaceId}/sendgrid/lists?${params}`)
          .json<SendGridListPage>()
        for (const item of data.data) {
          if (!seen.has(item.id)) {
            seen.add(item.id)
            all.push(item)
          }
        }
        if (!data.nextPageToken) {
          break
        }
        pageToken = data.nextPageToken
      }
      return all
    },
  )
  const customFields = callAPI<{ data: SendGridCustomField[] }>(
    `/api/workspaces/${workspaceId}/sendgrid/custom-fields`,
  )
  const listOptions = useMemo(
    () =>
      (allListItems ?? []).map((list) => ({
        label: list.name,
        value: list.id,
      })),
    [allListItems],
  )
  const customFieldOptions = useMemo(
    () =>
      (customFields.data?.data ?? []).map((field) => ({
        label: `${field.name} (${field.fieldType})`,
        value: field.id,
      })),
    [customFields.data],
  )
  const submit = (data: SendGridAddContactSchema) => {
    setValue(parentName, data)
    setOpen(false)
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
          <DialogTitle>{t("sendGrid.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(submit)}
          >
            <ComboboxField
              emptyText={t("actions.noRecordFound")}
              label={t("sendGrid.fields.list")}
              name="listId"
              options={listOptions}
              placeholder={t("sendGrid.fields.nothingSelected")}
            />
            {listsLoading && <p>{t("sendGrid.lists.loading")}</p>}
            {listsError && (
              <p className="text-destructive">{t("sendGrid.lists.error")}</p>
            )}
            <CustomFieldSelect
              includeReserved
              label={t("sendGrid.fields.emailField")}
              name="emailField"
              placeholder={t("sendGrid.fields.nothingSelected")}
              required
            />
            <CustomFieldSelect
              includeReserved
              label={t("sendGrid.fields.phoneField")}
              name="phoneField"
              placeholder={t("sendGrid.fields.nothingSelected")}
            />
            <div className="space-y-2">
              <FieldLabel
                label={t("sendGrid.fields.customFields")}
                optionalLabel={t("sendGrid.fields.optional")}
              />
              {customFields.isLoading && (
                <p className="text-muted-foreground text-sm">
                  {t("sendGrid.customFields.loading")}
                </p>
              )}
              {customFields.error && (
                <p className="text-destructive text-sm">
                  {t("sendGrid.customFields.error")}
                </p>
              )}
              {fields.map((field, index) => (
                <div
                  className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3"
                  key={field.id}
                >
                  <CustomFieldSelect
                    includeReserved
                    label=""
                    name={`mergeFields.${index}.contactFieldId`}
                    placeholder={t("sendGrid.fields.nothingSelected")}
                  />
                  <ArrowRightIcon className="size-4 text-muted-foreground rtl:rotate-180" />
                  <ComboboxField
                    emptyText={t("actions.noRecordFound")}
                    label=""
                    name={`mergeFields.${index}.sendGridField`}
                    options={customFieldOptions}
                    placeholder={t("sendGrid.fields.nothingSelected")}
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
              <Button
                onClick={() =>
                  append({ contactFieldId: "", sendGridField: "" })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <PlusIcon className="size-4" />
                {t("sendGrid.fields.addCustomField")}
              </Button>
            </div>
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

export default function SendGridAddContactEditor(props: {
  parentName: string
}) {
  const t = useTranslations()
  return (
    <BaseStepEditor
      icon={MailIcon}
      title={t("flows.actions.sendGridAddContact")}
    >
      <SendGridDialog parentName={props.parentName} />
    </BaseStepEditor>
  )
}
