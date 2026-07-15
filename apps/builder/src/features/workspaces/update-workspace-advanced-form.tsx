"use client"

import { SMART_RESPONSE_DELAY_OPTIONS } from "@chatbotx.io/database/partials"
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
  allTimezoneOptions,
  UNKNOWN_COUNTRY,
} from "./schema/types"
import {
  SMART_RESPONSE_DELAY_NONE_VALUE,
  updateWorkspaceAdvancedRequest,
} from "./schema/update-workspace-schema"

const getSmartResponseDelayOptionLabel = (
  delaySeconds: number,
  t: ReturnType<typeof useTranslations>,
) => {
  if (delaySeconds < 60) {
    return t("fields.smartResponseDelaySeconds.seconds", {
      count: delaySeconds,
    })
  }

  return t("fields.smartResponseDelaySeconds.minutes", {
    count: delaySeconds / 60,
  })
}

export function UpdateWorkspaceAdvancedForm({
  workspace,
}: {
  workspace: WorkspaceResource
}) {
  const t = useTranslations()
  const flowOptions = useFlowSelectOptions()

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
          targetCountry: workspace.targetCountry ?? UNKNOWN_COUNTRY,
          language: workspace.language,
          timezone: workspace.timezone,
          brandColor: workspace.brandColor,
          developmentMode: workspace.developmentMode,
          smartResponseDelaySeconds:
            workspace.smartResponseDelaySeconds == null
              ? SMART_RESPONSE_DELAY_NONE_VALUE
              : String(workspace.smartResponseDelaySeconds),
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <Card>
      <CardContent>
        <Form {...form}>
          <form
            className="flex flex-col gap-2"
            onSubmit={handleSubmitWithAction}
          >
            <SettingRow
              description={t("fields.defaultReply.description")}
              label={t("fields.defaultReply.label")}
            >
              <ComboboxField
                emptyText={t("actions.noRecordFound")}
                name="defaultReply"
                options={flowOptions}
                placeholder={t("actions.pleaseSelect")}
              />
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
              <SelectField
                name="language"
                options={[
                  { value: "en", label: t("fields.language.english") },
                  { value: "vi", label: t("fields.language.vietnamese") },
                ]}
                placeholder={t("actions.pleaseSelect")}
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

            <SettingRow
              description={t("fields.smartResponseDelaySeconds.description")}
              label={t("fields.smartResponseDelaySeconds.label")}
            >
              <SelectField
                name="smartResponseDelaySeconds"
                options={[
                  {
                    value: SMART_RESPONSE_DELAY_NONE_VALUE,
                    label: t("fields.smartResponseDelaySeconds.none"),
                  },
                  ...SMART_RESPONSE_DELAY_OPTIONS.map((delaySeconds) => ({
                    value: String(delaySeconds),
                    label: getSmartResponseDelayOptionLabel(delaySeconds, t),
                  })),
                ]}
                placeholder={t("actions.pleaseSelect")}
              />
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
