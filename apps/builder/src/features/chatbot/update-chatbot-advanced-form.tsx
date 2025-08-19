"use client"

import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { SwitchField } from "@aha.chat/ui/components/form/switch-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { ColorPicker } from "@aha.chat/ui/components/ui/color-picker"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { SettingRow } from "@/components/setting-row"
import type { ChatbotResource } from "@/features/chatbots/schemas"
import { FlowSelect } from "@/features/flows/flow-select"
import { updateChatbotAdvancedAction } from "./actions/update-chatbox-action"
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
  const { t } = useTranslate(["chatbot", "updateChatbotForm"])

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateChatbotAdvancedAction.bind(null, chatbot.id),
    zodResolver(updateChatbotAdvancedRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(t("updatedSuccessfully"))
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
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
            className="flex flex-col gap-y-4"
            onSubmit={handleSubmitWithAction}
          >
            <SettingRow
              description={t("defaultReply.label.description")}
              label={t("defaultReply.label")}
            >
              <FlowSelect name="defaultReply" />
            </SettingRow>

            <SettingRow
              description={t("targetCountry.label.description")}
              label={t("targetCountry.label")}
            >
              <ComboboxField name="targetCountry" options={allCountryOptions} />
            </SettingRow>

            <SettingRow
              description={t("defaultLanguage.label.description")}
              label={t("defaultLanguage.label")}
            >
              <SelectField
                name="defaultLanguage"
                options={[
                  { value: "en", label: "English" },
                  { value: "vi", label: "Tiếng Việt" },
                ]}
              />
            </SettingRow>

            <SettingRow
              description={t("accountTimezone.label.description")}
              label={t("accountTimezone.label")}
            >
              <ComboboxField
                name="accountTimezone"
                options={allTimezoneOptions}
              />
            </SettingRow>

            <SettingRow
              description={t("brandColor.label.description")}
              label={t("brandColor.label")}
            >
              <FormField
                control={form.control}
                name={"brandColor"}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <ColorPicker {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </SettingRow>

            <SettingRow
              description={t("developmentMode.label.description")}
              label={t("developmentMode.label")}
            >
              <SwitchField className="mt-1.5" name="developmentMode" />
            </SettingRow>

            <div className="mt-4 text-center">
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("common.saveBtn")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
