"use client"

import {
  type GoogleAdsConsent,
  type GoogleAdsConsentSource,
  type GoogleAdsUploadMethod,
  googleAdsConsentSchema,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { ExternalLinkIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { updateGoogleAdsConsentAction } from "../actions/update-consent.action"
import { useInvalidateGoogleAds } from "../hooks/use-invalidate-google-ads"
import type {
  GoogleAdsConsentSettingView,
  GoogleAdsConsentView,
} from "../schema/integration"
import { ConsentSourceField } from "./consent-source-field"
import { NoticeAlert } from "./notice-alert"
import { SettingsSection } from "./settings-section"

/** Google Ads Data Manager help: "Manage consent settings". */
const CONSENT_HELP_URL =
  "https://support.google.com/google-ads-data-manager/answer/13944739"

const toSource = (
  setting: GoogleAdsConsentSettingView | null,
): GoogleAdsConsentSource => {
  switch (setting?.type) {
    case "granted":
      return { type: "granted" }
    case "denied":
      return { type: "denied" }
    case "variable":
      return { type: "variable", template: setting.template ?? "" }
    default:
      return { type: "notProvided" }
  }
}

/** Absent and unreadable stored settings both start the form at "Not provided". */
const toFormValues = (consent: GoogleAdsConsentView): GoogleAdsConsent => ({
  adUserData: toSource(consent.adUserData),
  adPersonalization: toSource(consent.adPersonalization),
})

type ConsentSectionProps = {
  workspaceId: string
  consent: GoogleAdsConsentView
  /** Null when no Google Ads account is connected. */
  uploadMethod: GoogleAdsUploadMethod | null
}

export const ConsentSection = ({
  workspaceId,
  consent,
  uploadMethod,
}: ConsentSectionProps) => {
  const t = useTranslations()
  const router = useRouter()
  const invalidate = useInvalidateGoogleAds()
  const [hasSaved, setHasSaved] = useState(false)

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateGoogleAdsConsentAction.bind(null, workspaceId),
    zodResolver(googleAdsConsentSchema),
    {
      actionProps: {
        onSuccess: async ({ data }) => {
          if (data) {
            form.reset(data)
          }
          setHasSaved(true)
          toast.success(t("googleAds.consent.saved"))
          // Invalidate before the refresh: it never touches the QueryClient.
          await invalidate()
          router.refresh()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onBlur",
        defaultValues: toFormValues(consent),
      },
    },
  )

  const isSaving = form.formState.isSubmitting
  const isInvalidStored = consent.status === "invalid" && !hasSaved
  // An unreadable stored document has nothing to be "dirty" against: saving is the fix.
  const canSave = form.formState.isDirty || isInvalidStored

  return (
    <SettingsSection
      description={
        <>
          {t("googleAds.consent.description")}{" "}
          <a
            className="inline-flex items-center gap-1 underline underline-offset-4"
            href={CONSENT_HELP_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("googleAds.consent.learnMore")}
            <ExternalLinkIcon aria-hidden="true" className="size-3" />
          </a>
        </>
      }
      title={t("googleAds.consent.title")}
    >
      {isInvalidStored ? (
        <NoticeAlert tone="destructive">
          {t("googleAds.consent.invalidStored")}
        </NoticeAlert>
      ) : null}
      {uploadMethod === null ? (
        <p className="text-muted-foreground text-sm">
          {t("googleAds.consent.notConnected")}
        </p>
      ) : null}
      <Form {...form}>
        <form
          className="flex flex-col gap-5"
          noValidate
          onSubmit={handleSubmitWithAction}
        >
          <ConsentSourceField isDisabled={isSaving} name="adUserData" />
          <ConsentSourceField isDisabled={isSaving} name="adPersonalization" />
          {uploadMethod === "legacy" ? (
            <NoticeAlert
              role="status"
              title={t("googleAds.consent.legacy.title")}
              tone="warning"
            >
              {t("googleAds.consent.legacy.body")}
            </NoticeAlert>
          ) : null}
          <Button
            className="w-full sm:w-auto sm:self-start"
            disabled={!canSave || isSaving}
            type="submit"
          >
            {isSaving ? (
              <Loader2Icon aria-hidden="true" className="animate-spin" />
            ) : null}
            {t("googleAds.consent.save")}
          </Button>
        </form>
      </Form>
    </SettingsSection>
  )
}
