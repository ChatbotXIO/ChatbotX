"use client"

import {
  type ActiveCampaignSyncContactSchema,
  activeCampaignSyncContactDefaultFn,
  activeCampaignSyncContactSchema,
} from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
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
import {
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import type { z } from "zod"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"
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

const ActiveCampaignDialog = ({ parentName }: { parentName: string }) => {
  const [open, setOpen] = useState(false)
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { getValues, setValue } = useFormContext()

  const form = useForm<
    z.input<typeof activeCampaignSyncContactSchema>,
    unknown,
    ActiveCampaignSyncContactSchema
  >({
    resolver: zodResolver(activeCampaignSyncContactSchema),
    defaultValues: {
      ...activeCampaignSyncContactDefaultFn(),
      ...getValues(parentName),
    },
    mode: "onChange",
  })
  const operation = useWatch({
    control: form.control,
    name: "operation",
  })

  const {
    fields: fieldValues,
    append,
    remove,
  } = useFieldArray({
    control: form.control,
    name: "fieldValues",
  })

  const isAutomationMode = operation === "addContactToAutomation"

  const {
    data: listsResponse,
    isError: listsError,
    isLoading: listsLoading,
  } = useQuery(
    orpc.integrationActiveCampaignAPI.listLists.queryOptions({
      input: { workspaceId },
      enabled: !isAutomationMode,
    }),
  )
  const {
    data: automationsResponse,
    isError: automationsError,
    isLoading: automationsLoading,
  } = useQuery(
    orpc.integrationActiveCampaignAPI.listAutomations.queryOptions({
      input: { workspaceId },
      enabled: isAutomationMode,
    }),
  )
  const {
    data: tagsResponse,
    isError: tagsError,
    isLoading: tagsLoading,
  } = useQuery(
    orpc.integrationActiveCampaignAPI.listTags.queryOptions({
      input: { workspaceId },
      enabled: !isAutomationMode,
    }),
  )
  const {
    data: customFieldsResponse,
    isError: customFieldsError,
    isLoading: customFieldsLoading,
  } = useQuery(
    orpc.integrationActiveCampaignAPI.listCustomFields.queryOptions({
      input: { workspaceId },
      enabled: !isAutomationMode,
    }),
  )

  const listOptions = useMemo(
    () =>
      (listsResponse?.data ?? []).map((list) => ({
        label: list.name || list.id,
        value: list.id,
      })),
    [listsResponse],
  )
  const automationOptions = useMemo(
    () =>
      (automationsResponse?.data ?? []).map((automation) => ({
        label: automation.name || automation.id,
        value: automation.id,
      })),
    [automationsResponse],
  )
  const tagOptions = useMemo(
    () =>
      (tagsResponse?.data ?? []).map((tag) => ({
        label: tag.tag || tag.name || tag.id,
        value: tag.id,
      })),
    [tagsResponse],
  )
  const customFieldOptions = useMemo(
    () =>
      (customFieldsResponse?.data ?? []).map((field) => ({
        label: field.label,
        value: field.id,
      })),
    [customFieldsResponse],
  )
  const operationOptions = useMemo(
    () => [
      {
        label: t("activeCampaign.operations.createOrUpdateContact"),
        value: "createOrUpdateContact",
      },
      {
        label: t("activeCampaign.operations.addContactToAutomation"),
        value: "addContactToAutomation",
      },
    ],
    [t],
  )

  const submit = (data: ActiveCampaignSyncContactSchema) => {
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
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader className="text-center">
          <DialogTitle>{t("activeCampaign.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(submit)}
          >
            <SelectField
              label={t("activeCampaign.fields.operation")}
              name="operation"
              options={operationOptions}
              required
            />
            <div className="space-y-2">
              <FieldLabel
                label={t("activeCampaign.fields.emailField")}
                tooltip={t("activeCampaign.fields.emailTooltip")}
              />
              <CustomFieldSelect
                includeReserved
                label=""
                name="emailField"
                placeholder={t("activeCampaign.fields.nothingSelected")}
                required
              />
            </div>
            {operation === "addContactToAutomation" ? (
              <>
                {automationsLoading && (
                  <p className="text-muted-foreground text-sm">
                    {t("activeCampaign.automations.loading")}
                  </p>
                )}
                {automationsError && (
                  <p className="text-destructive text-sm">
                    {t("activeCampaign.automations.error")}
                  </p>
                )}
                {!(automationsLoading || automationsError) && (
                  <ComboboxField
                    emptyText={t("actions.noRecordFound")}
                    label={t("activeCampaign.fields.automation")}
                    name="automationId"
                    options={automationOptions}
                    placeholder={t("activeCampaign.fields.nothingSelected")}
                    required
                  />
                )}
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <FieldLabel
                    label={t("activeCampaign.fields.phone")}
                    optionalLabel={t("activeCampaign.fields.optional")}
                  />
                  <CustomFieldSelect
                    includeReserved
                    label=""
                    name="phoneField"
                    placeholder={t("activeCampaign.fields.emptyField")}
                  />
                </div>
                {listsLoading && (
                  <p className="text-muted-foreground text-sm">
                    {t("activeCampaign.lists.loading")}
                  </p>
                )}
                {listsError && (
                  <p className="text-destructive text-sm">
                    {t("activeCampaign.lists.error")}
                  </p>
                )}
                {!(listsLoading || listsError) && (
                  <div className="space-y-2">
                    <FieldLabel
                      label={t("activeCampaign.fields.list")}
                      optionalLabel={t("activeCampaign.fields.optional")}
                    />
                    <MultiSelectField
                      label=""
                      name="listIds"
                      options={listOptions}
                      placeholder={t("activeCampaign.fields.emptyField")}
                    />
                  </div>
                )}
                {tagsLoading && (
                  <p className="text-muted-foreground text-sm">
                    {t("activeCampaign.tags.loading")}
                  </p>
                )}
                {tagsError && (
                  <p className="text-destructive text-sm">
                    {t("activeCampaign.tags.error")}
                  </p>
                )}
                {!(tagsLoading || tagsError) && (
                  <div className="space-y-2">
                    <FieldLabel
                      label={t("activeCampaign.fields.tags")}
                      optionalLabel={t("activeCampaign.fields.optional")}
                    />
                    <MultiSelectField
                      label=""
                      name="tagIds"
                      options={tagOptions}
                      placeholder={t("activeCampaign.fields.emptyField")}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <FieldLabel
                    label={t("activeCampaign.fields.customFields")}
                    optionalLabel={t("activeCampaign.fields.optional")}
                  />
                  {customFieldsLoading && (
                    <p className="text-muted-foreground text-sm">
                      {t("activeCampaign.customFields.loading")}
                    </p>
                  )}
                  {customFieldsError && (
                    <p className="text-destructive text-sm">
                      {t("activeCampaign.customFields.error")}
                    </p>
                  )}
                  {fieldValues.map((field, index) => (
                    <div
                      className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3"
                      key={field.id}
                    >
                      <CustomFieldSelect
                        includeReserved
                        label=""
                        name={`fieldValues.${index}.contactFieldId`}
                        placeholder={t("activeCampaign.fields.nothingSelected")}
                      />
                      <ArrowRightIcon className="size-4 text-muted-foreground rtl:rotate-180" />
                      <ComboboxField
                        emptyText={t("actions.noRecordFound")}
                        label=""
                        name={`fieldValues.${index}.activeCampaignFieldId`}
                        options={customFieldOptions}
                        placeholder={t("activeCampaign.fields.nothingSelected")}
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
                        append({
                          contactFieldId: "",
                          activeCampaignFieldId: "",
                        })
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <PlusIcon className="size-4" />
                      {t("activeCampaign.fields.addCustomField")}
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

export default function ActiveCampaignSyncContactEditor(props: {
  parentName: string
}) {
  const t = useTranslations()
  return (
    <BaseStepEditor
      icon={MailIcon}
      title={t("flows.actions.activeCampaignSyncContact")}
    >
      <ActiveCampaignDialog parentName={props.parentName} />
    </BaseStepEditor>
  )
}
