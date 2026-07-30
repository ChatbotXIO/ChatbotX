"use client"

import {
  type GetResponseAddContactSchema,
  getResponseAddContactDefaultFn,
  getResponseAddContactSchema,
} from "@chatbotx.io/flow-config"
import {
  GET_RESPONSE_CAMPAIGNS_PAGE_SIZE,
  GET_RESPONSE_TAGS_PAGE_SIZE,
  type GetResponseCampaign,
  type GetResponsePageMeta,
  type GetResponseTag,
} from "@chatbotx.io/integration-get-response"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
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
import { CircleHelpIcon, MailIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import type { z } from "zod"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useWorkspaceId } from "@/hooks/routing"
import { callAPI } from "@/lib/swr"
import { BaseStepEditor } from "../base/editor"

type GetResponsePage<T> = {
  data: T[]
  meta: GetResponsePageMeta
}

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

const GetResponseDialog = ({ parentName }: { parentName: string }) => {
  const [open, setOpen] = useState(false)
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { getValues, setValue } = useFormContext()

  const form = useForm<
    z.input<typeof getResponseAddContactSchema>,
    unknown,
    GetResponseAddContactSchema
  >({
    resolver: zodResolver(getResponseAddContactSchema),
    defaultValues: {
      ...getResponseAddContactDefaultFn(),
      ...getValues(parentName),
    },
    mode: "onChange",
  })

  const {
    data: campaignsResponse,
    error: campaignsError,
    isLoading: campaignsLoading,
  } = callAPI<GetResponsePage<GetResponseCampaign>>(
    open
      ? `/api/workspaces/${workspaceId}/get-response/campaigns?page=1&perPage=${GET_RESPONSE_CAMPAIGNS_PAGE_SIZE}`
      : null,
  )
  const {
    data: tagsResponse,
    error: tagsError,
    isLoading: tagsLoading,
  } = callAPI<GetResponsePage<GetResponseTag>>(
    open
      ? `/api/workspaces/${workspaceId}/get-response/tags?page=1&perPage=${GET_RESPONSE_TAGS_PAGE_SIZE}`
      : null,
  )

  const campaignOptions = useMemo(
    () =>
      (campaignsResponse?.data ?? []).map((campaign) => ({
        label: campaign.name || campaign.campaignId,
        value: campaign.campaignId,
      })),
    [campaignsResponse],
  )
  const tagOptions = useMemo(
    () =>
      (tagsResponse?.data ?? []).map((tag) => ({
        label: tag.name || tag.tagId,
        value: tag.tagId,
      })),
    [tagsResponse],
  )
  const campaignsLimited = (campaignsResponse?.meta.lastPage ?? 1) > 1
  const tagsLimited = (tagsResponse?.meta.lastPage ?? 1) > 1

  const submit = (data: GetResponseAddContactSchema) => {
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
          <DialogTitle>{t("flows.actions.getResponseAddContact")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(submit)}
          >
            {campaignsLoading && (
              <p className="text-muted-foreground text-sm">
                {t("getResponse.campaigns.loading")}
              </p>
            )}
            {campaignsError && (
              <p className="text-destructive text-sm">
                {t("getResponse.campaigns.error")}
              </p>
            )}
            {!(campaignsLoading || campaignsError) && (
              <ComboboxField
                emptyText={t("actions.noRecordFound")}
                label={t("getResponse.fields.list")}
                name="campaignId"
                options={campaignOptions}
                placeholder={t("getResponse.fields.listPlaceholder")}
                required
              />
            )}
            {campaignsLimited && (
              <p className="text-muted-foreground text-xs">
                {t("getResponse.campaigns.limited")}
              </p>
            )}
            <div className="space-y-2">
              <FieldLabel
                label={t("getResponse.fields.email")}
                tooltip={t("getResponse.fields.emailTooltip")}
              />
              <CustomFieldSelect
                includeReserved
                label=""
                name="emailField"
                placeholder={t("getResponse.fields.emailPlaceholder")}
                required
              />
            </div>
            {tagsLoading && (
              <p className="text-muted-foreground text-sm">
                {t("getResponse.tags.loading")}
              </p>
            )}
            {tagsError && (
              <p className="text-destructive text-sm">
                {t("getResponse.tags.error")}
              </p>
            )}
            {!(tagsLoading || tagsError) && (
              <div className="space-y-2">
                <FieldLabel
                  label={t("getResponse.fields.tags")}
                  optionalLabel={t("getResponse.fields.optional")}
                />
                <MultiSelectField
                  label=""
                  name="tags"
                  options={tagOptions}
                  placeholder={t("getResponse.fields.tagsPlaceholder")}
                />
              </div>
            )}
            {tagsLimited && (
              <p className="text-muted-foreground text-xs">
                {t("getResponse.tags.limited")}
              </p>
            )}
            <div className="space-y-2">
              <FieldLabel
                label={t("getResponse.fields.dayOfCycle")}
                optionalLabel={t("getResponse.fields.optional")}
                tooltip={t("getResponse.fields.dayOfCycleTooltip")}
              />
              <InputField
                label=""
                name="dayOfCycle"
                placeholder={t("getResponse.fields.dayOfCyclePlaceholder")}
                type="number"
              />
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

export default function GetResponseAddContactEditor(props: {
  parentName: string
}) {
  const t = useTranslations()
  return (
    <BaseStepEditor
      icon={MailIcon}
      title={t("flows.actions.getResponseAddContact")}
    >
      <GetResponseDialog parentName={props.parentName} />
    </BaseStepEditor>
  )
}
