"use client"

import {
  type MailchimpAddMemberSchema,
  mailchimpAddMemberSchema,
} from "@chatbotx.io/flow-config"
import type {
  MailchimpAudience,
  MailchimpMergeField,
  MailchimpTag,
} from "@chatbotx.io/integration-mailchimp"
import { isSupportedMailchimpMergeFieldType } from "@chatbotx.io/integration-mailchimp"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
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
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRightIcon, CircleHelpIcon, MailIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
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
  tooltip?: string
  optionalLabel?: string
  bold?: boolean
}) => (
  <div className="flex items-center gap-1">
    <Label className={props.bold ? "font-semibold" : undefined}>
      {props.label}
    </Label>
    {props.optionalLabel && (
      <span className="font-semibold text-sm">({props.optionalLabel})</span>
    )}
    {props.tooltip && (
      <Tooltip>
        <TooltipTrigger asChild>
          <CircleHelpIcon className="size-4 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{props.tooltip}</TooltipContent>
      </Tooltip>
    )}
  </div>
)

const MailchimpDialog = ({ parentName }: { parentName: string }) => {
  const [open, setOpen] = useState(false)
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { getValues, setValue } = useFormContext()
  const form = useForm<MailchimpAddMemberSchema>({
    resolver: zodResolver(mailchimpAddMemberSchema),
    defaultValues: { ...getValues(parentName) },
    mode: "onChange",
  })
  const listId = useWatch({ control: form.control, name: "listId" })
  const doubleOptIn = useWatch({
    control: form.control,
    name: "doubleOptIn",
  })
  const { fields: mergeFields, remove: removeMergeField } = useFieldArray({
    control: form.control,
    name: "mergeFields",
  })

  const [mergeFieldsInitialized, setMergeFieldsInitialized] = useState(
    () => form.getValues("mergeFields").length > 0,
  )

  const { data: audiencesResponse, error: audiencesError } = callAPI<{
    data: MailchimpAudience[]
  }>(`/api/workspaces/${workspaceId}/mailchimp/audiences`)
  const { data: tagsResponse } = callAPI<{ data: MailchimpTag[] }>(
    listId
      ? `/api/workspaces/${workspaceId}/mailchimp/tags?listId=${encodeURIComponent(listId)}`
      : null,
  )
  const { data: mergeFieldsResponse, error: mergeFieldsError } = callAPI<{
    data: MailchimpMergeField[]
  }>(
    listId
      ? `/api/workspaces/${workspaceId}/mailchimp/merge-fields?listId=${encodeURIComponent(listId)}`
      : null,
  )

  useEffect(() => {
    if (!mergeFieldsResponse?.data) {
      return
    }
    const supportedMergeFields = mergeFieldsResponse.data.filter((field) =>
      isSupportedMailchimpMergeFieldType(field.type),
    )
    const current = form.getValues("mergeFields")
    if (mergeFieldsInitialized) {
      form.setValue(
        "mergeFields",
        current.flatMap((mapping) => {
          const field = mergeFieldsResponse.data.find(
            (item) => item.tag === mapping.tag,
          )
          if (
            !isSupportedMailchimpMergeFieldType(
              field?.type ?? mapping.type ?? mapping.tag,
            )
          ) {
            return []
          }
          return field
            ? [{ ...mapping, name: field.name, type: field.type }]
            : [mapping]
        }),
      )
      return
    }
    if (current.length > 0) {
      setMergeFieldsInitialized(true)
      return
    }
    form.setValue(
      "mergeFields",
      supportedMergeFields.map((field) => ({
        tag: field.tag,
        name: field.name,
        type: field.type,
        customFieldId:
          current.find((item) => item.tag === field.tag)?.customFieldId ?? "",
      })),
    )
    setMergeFieldsInitialized(true)
  }, [form, mergeFieldsInitialized, mergeFieldsResponse])

  const onChangeAudience = () => {
    form.setValue("mergeFields", [])
    setMergeFieldsInitialized(false)
  }

  const audienceOptions = useMemo(
    () =>
      (audiencesResponse?.data ?? []).map((item) => ({
        label: item.name,
        value: item.id,
      })),
    [audiencesResponse],
  )
  const tagOptions = useMemo(
    () =>
      (tagsResponse?.data ?? []).map((item) => ({
        label: item.name,
        value: item.name,
      })),
    [tagsResponse],
  )

  const submit = (data: MailchimpAddMemberSchema) => {
    setValue(parentName, data)
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          {t("actions.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("flows.actions.mailchimpAddMember")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(submit)}
          >
            <ComboboxField
              emptyText={t("actions.noRecordFound")}
              label={t("mailchimp.fields.audience")}
              name="listId"
              options={audienceOptions}
              placeholder={t("actions.pleaseSelect")}
              required
              triggerValueChange={onChangeAudience}
            />
            {audiencesError && (
              <p className="text-destructive text-sm">
                {t("messages.errorLoadingData")}
              </p>
            )}
            {listId && (
              <>
                <div className="space-y-2">
                  <FieldLabel
                    label={t("mailchimp.fields.email")}
                    tooltip={t("mailchimp.fields.emailTooltip")}
                  />
                  <CustomFieldSelect
                    includeReserved
                    label=""
                    name="email"
                    required
                  />
                </div>
                <div className="flex items-center justify-between">
                  <FieldLabel
                    label={t("mailchimp.fields.doubleOptIn")}
                    tooltip={t("mailchimp.fields.doubleOptInTooltip")}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">
                      {doubleOptIn
                        ? t("mailchimp.fields.on")
                        : t("mailchimp.fields.off")}
                    </span>
                    <SwitchField
                      formItemClassName="w-auto!"
                      label=""
                      name="doubleOptIn"
                    />
                  </div>
                </div>
                <MultiSelectField
                  label={t("mailchimp.fields.tags")}
                  name="tags"
                  options={tagOptions}
                />
                <FieldLabel
                  bold
                  label={t("mailchimp.fields.mergeFields")}
                  optionalLabel={t("mailchimp.fields.optional")}
                />
                {mergeFieldsError && (
                  <p className="text-destructive text-sm">
                    {t("messages.errorLoadingData")}
                  </p>
                )}
                {mergeFields.map((field, index) => (
                  <div
                    className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3"
                    key={field.id}
                  >
                    <div>
                      <CustomFieldSelect
                        includeReserved
                        label=""
                        name={`mergeFields.${index}.customFieldId`}
                      />
                    </div>
                    <ArrowRightIcon className="size-4 text-muted-foreground" />
                    <InputField
                      disabled
                      label=""
                      name={`mergeFields.${index}.name`}
                    />
                    <Button
                      aria-label={t("actions.remove")}
                      onClick={() => removeMergeField(index)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                ))}
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

export default function MailchimpAddMemberEditor(props: {
  parentName: string
}) {
  const t = useTranslations()
  return (
    <BaseStepEditor
      icon={MailIcon}
      title={t("flows.actions.mailchimpAddMember")}
    >
      <MailchimpDialog parentName={props.parentName} />
    </BaseStepEditor>
  )
}
