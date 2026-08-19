"use client"

import { defaultReplyFrequencies } from "@chatbotx.io/database/partials"
import { ColorPickerField } from "@chatbotx.io/ui/components/form/color-picker-field"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { SettingRow } from "@/components/setting-row"
import type { WorkspaceResource } from "@/features/workspaces/schema/resource"
import { useFlowSelectOptions } from "../flows/provider/flow-hook"
import { updateWorkspaceAdvancedAction } from "./actions/update-workspace-action"
import {
  allCountryOptions,
  allSupportedLanguages,
  allTimezoneCodes,
  allTimezoneOptions,
  UNKNOWN_COUNTRY,
} from "./schema/types"
import { updateWorkspaceAdvancedRequest } from "./schema/update-workspace-schema"

// Legacy workspaces (and every channel-connect action) store the timezone as
// `"UTC"`, but `allTimezoneCodes` is keyed by the IANA canonical `"Etc/UTC"`.
// Left as-is, `z.enum(allTimezoneCodes)` rejects `"UTC"`, the whole advanced
// form is invalid, and the Confirm button stays disabled forever. Coerce any
// stored value that is not a known code to a valid one so the form loads valid
// and self-heals the row on the next save.
const FALLBACK_TIMEZONE = "Etc/UTC"
const timezoneCodeSet = new Set<string>(allTimezoneCodes)

function normalizeTimezone(timezone: string): string {
  return timezoneCodeSet.has(timezone) ? timezone : FALLBACK_TIMEZONE
}

export function UpdateWorkspaceAdvancedForm({
  workspace,
}: {
  workspace: WorkspaceResource
}) {
  const t = useTranslations()
  const flowOptions = useFlowSelectOptions()
  const defaultReplyFrequencyOptions = defaultReplyFrequencies.options.map(
    (frequency) => ({
      value: frequency,
      label: t(`fields.defaultReplyFrequency.options.${frequency}`),
    }),
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateWorkspaceAdvancedAction.bind(null, workspace.id),
    zodResolver(updateWorkspaceAdvancedRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.workspace.label"),
            }),
          )
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          defaultReply: workspace.defaultReply ?? "",
          defaultReplyFrequency: workspace.defaultReplyFrequency,
          targetCountry: workspace.targetCountry ?? UNKNOWN_COUNTRY,
          language: workspace.language,
          timezone: normalizeTimezone(workspace.timezone),
          brandColor: workspace.brandColor,
          developmentMode: workspace.developmentMode,
        },
      },
      errorMapProps: {},
    },
  )

  const hasDefaultReply = Boolean(form.watch("defaultReply"))

  return (
    <Card>
      <CardContent>
        <Form {...form}>
          <form
            className="flex flex-col gap-2"
            onSubmit={handleSubmitWithAction}
          >
            <SettingRow
              description={
                <>
                  <p>{t("fields.defaultReply.description")}</p>
                  {hasDefaultReply && (
                    <p>{t("fields.defaultReplyFrequency.description")}</p>
                  )}
                </>
              }
              label={t("fields.defaultReply.label")}
            >
              <div className="flex flex-col gap-2">
                <ComboboxField
                  allowClear
                  clearLabel={t("messages.none")}
                  emptyText={t("actions.noRecordFound")}
                  emptyValue={null}
                  name="defaultReply"
                  options={flowOptions}
                  placeholder={t("actions.pleaseSelect")}
                />
                {hasDefaultReply && (
                  <SelectField
                    name="defaultReplyFrequency"
                    options={defaultReplyFrequencyOptions}
                    placeholder={t("actions.pleaseSelect")}
                  />
                )}
              </div>
            </SettingRow>

            <SettingRow
              description={t("fields.targetCountry.description")}
              label={t("fields.targetCountry.label")}
            >
              <ComboboxField
                emptyText={t("actions.noRecordFound")}
                name="targetCountry"
                options={allCountryOptions}
                placeholder={t("actions.pleaseSelect")}
              />
            </SettingRow>

            <SettingRow
              description={t("fields.language.description")}
              label={t("fields.language.label")}
            >
              <ComboboxField
                emptyText={t("actions.noRecordFound")}
                name="language"
                options={allSupportedLanguages}
                placeholder={t("actions.pleaseSelect")}
                searchPlaceholder={t("actions.search")}
              />
            </SettingRow>

            <SettingRow
              description={t("fields.timezone.description")}
              label={t("fields.timezone.label")}
            >
              <ComboboxField
                emptyText={t("actions.noRecordFound")}
                name="timezone"
                options={allTimezoneOptions}
                placeholder={t("actions.pleaseSelect")}
              />
            </SettingRow>

            <SettingRow
              description={t("fields.brandColor.description")}
              label={t("fields.brandColor.label")}
            >
              <ColorPickerField name="brandColor" required={true} />
            </SettingRow>

            <SettingRow
              description={t("fields.developmentMode.description")}
              label={t("fields.developmentMode.label")}
            >
              <SwitchField className="mt-1.5" name="developmentMode" />
            </SettingRow>

            <div className="mt-4 flex flex-start">
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                size="sm"
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.confirm")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
