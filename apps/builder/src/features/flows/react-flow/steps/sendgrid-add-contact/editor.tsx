"use client"

import {
  type SendGridAddContactSchema,
  sendGridAddContactSchema,
} from "@chatbotx.io/flow-config"
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
import { useQuery } from "@tanstack/react-query"
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
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useWorkspaceId } from "@/hooks/routing"
import { client } from "@/lib/orpc/orpc"
import { orpc } from "@/lib/orpc/query"
import { fetchAllPages } from "@/lib/query/fetch-all-pages"
import { BaseStepEditor } from "../base/editor"

const SENDGRID_ALL_LISTS_MAX_PAGES = 10
const SENDGRID_ALL_LISTS_PAGE_SIZE = 1000

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
    isError: listsError,
  } = useQuery({
    queryKey: [
      ...orpc.integrationSendGridAPI.listLists.key(),
      "all-pages",
      { workspaceId },
    ],
    queryFn: () => {
      const seen = new Set<string>()
      return fetchAllPages({
        initialPageParam: undefined as string | undefined,
        maxPages: SENDGRID_ALL_LISTS_MAX_PAGES,
        fetchPage: async (pageToken) => {
          const data = await client.integrationSendGridAPI.listLists({
            workspaceId,
            pageSize: SENDGRID_ALL_LISTS_PAGE_SIZE,
            pageToken,
          })
          const items = data.data.filter((item) => {
            if (seen.has(item.id)) {
              return false
            }
            seen.add(item.id)
            return true
          })
          return { items, nextPageParam: data.nextPageToken }
        },
      })
    },
    enabled: Boolean(workspaceId),
  })
  const customFields = useQuery(
    orpc.integrationSendGridAPI.listCustomFields.queryOptions({
      input: { workspaceId },
    }),
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
              {customFields.isError && (
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
