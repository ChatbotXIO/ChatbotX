"use client"

import { ColorPickerField } from "@aha.chat/ui/components/form/color-picker-field"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { SwitchField } from "@aha.chat/ui/components/form/switch-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { SettingRow } from "@/components/setting-row"
import type { ChatbotResource } from "@/features/chatbots/schemas/resource"
import { useFlowSelectOptions } from "../flows/provider/flow-hook"
import { updateChatbotAdvancedAction } from "./actions/update-chatbot-action"
import {
  allCountryOptions,
  allTimezoneOptions,
  UNKNOWN_COUNTRY,
} from "./schemas/types"
import { updateChatbotAdvancedRequest } from "./schemas/update-chatbot-schema"

export function UpdateChatbotAdvancedForm({
  chatbot,
}: {
  chatbot: ChatbotResource
}) {
  const t = useTranslations()
  const flowOptions = useFlowSelectOptions()

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateChatbotAdvancedAction.bind(null, chatbot.id),
    zodResolver(updateChatbotAdvancedRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.chatbot.label"),
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
          defaultReply: chatbot.defaultReply ?? "",
          targetCountry: chatbot.targetCountry ?? UNKNOWN_COUNTRY,
          defaultLanguage: chatbot.defaultLanguage,
          accountTimezone: chatbot.accountTimezone,
          brandColor: chatbot.brandColor,
          developmentMode: chatbot.developmentMode,
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
              <ComboboxField name="defaultReply" options={flowOptions} />
            </SettingRow>

            <SettingRow
              description={t("fields.targetCountry.description")}
              label={t("fields.targetCountry.label")}
            >
              <ComboboxField name="targetCountry" options={allCountryOptions} />
            </SettingRow>

            <SettingRow
              description={t("fields.defaultLanguage.description")}
              label={t("fields.defaultLanguage.label")}
            >
              <SelectField
                name="defaultLanguage"
                options={[
                  { value: "en", label: t("fields.language.english") },
                  { value: "vi", label: t("fields.language.vietnamese") },
                ]}
              />
            </SettingRow>

            <SettingRow
              description={t("fields.accountTimezone.description")}
              label={t("fields.accountTimezone.label")}
            >
              <ComboboxField
                name="accountTimezone"
                options={allTimezoneOptions}
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
