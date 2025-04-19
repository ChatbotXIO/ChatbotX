"use client"

import { ComboboxField } from "@/components/form/combobox-field"
import { SelectField } from "@/components/form/select-field"
import { SwitchField } from "@/components/form/switch-field"
import { SettingRow } from "@/components/setting-row"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ColorPicker } from "@/components/ui/color-picker"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form"
import type { ChatbotResource } from "@/features/chatbots/schemas"
import { FlowSelect } from "@/features/flows/flow-select"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
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
            onSubmit={handleSubmitWithAction}
            className="flex flex-col gap-y-4"
          >
            <SettingRow
              label={t("defaultReply.label")}
              description={t("defaultReply.label.description")}
            >
              <FlowSelect name="defaultReply" />
            </SettingRow>

            <SettingRow
              label={t("targetCountry.label")}
              description={t("targetCountry.label.description")}
            >
              <ComboboxField name="targetCountry" options={allCountryOptions} />
            </SettingRow>

            <SettingRow
              label={t("defaultLanguage.label")}
              description={t("defaultLanguage.label.description")}
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
              label={t("accountTimezone.label")}
              description={t("accountTimezone.label.description")}
            >
              <ComboboxField
                name="accountTimezone"
                options={allTimezoneOptions}
              />
            </SettingRow>

            <SettingRow
              label={t("brandColor.label")}
              description={t("brandColor.label.description")}
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
              label={t("developmentMode.label")}
              description={t("developmentMode.label.description")}
            >
              <SwitchField name="developmentMode" className="mt-1.5" />
            </SettingRow>

            <div className="mt-4 text-center">
              <Button
                type="submit"
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
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
