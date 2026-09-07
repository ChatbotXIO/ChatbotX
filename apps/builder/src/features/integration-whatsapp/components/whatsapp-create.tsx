"use client"

import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"
import { Alert, AlertTitle } from "@chatbotx.io/ui/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { CONNECT_PICKER_CARD_CLASS } from "@/features/channel-connect/components/connect-picker-card"
import { renderConnectFlowOverlay } from "@/features/channel-connect/components/connect-picker-screen"
import { SESSION_ERROR_MESSAGE_KEYS } from "@/features/channel-connect/lib/row-status"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { CoexistPopup } from "@/features/shared/coexist-popup"
import { useConnectFormVisibility } from "../hooks/use-connect-form-visibility"
import { useWhatsappConnectFanout } from "../hooks/use-whatsapp-connect-fanout"
import { useWhatsappConnectForm } from "../hooks/use-whatsapp-connect-form"
import { useWhatsappConnectStages } from "../hooks/use-whatsapp-connect-stages"
import { isCoexistOnboardingIntent } from "../libs/embedded-signup"
import { FORM_FIELDS } from "../libs/form-fields"
import { WhatsappPhoneVerificationQueue } from "../verification/whatsapp-phone-verification-queue"
import {
  ManualConnectSection,
  PhoneNumberSelectionSection,
} from "./whatsapp-connect-sections"
import { WhatsappOnboardingResult } from "./whatsapp-onboarding-result"
import { SdkConnectSection } from "./whatsapp-sdk-connect-section"

type WhatsappCreateProps = {
  workspaceId?: string | null
  settings: WhatsappCredentialPublic
  /**
   * Absolute callback URL registered with Meta for this credential — the
   * broker callback for inherited/platform credentials, or the reseller's
   * own custom domain callback for a tenant-owned one. Computed server-side
   * (see `lib/provider-origin.ts`).
   */
  oauthCallbackUrl: string
}

export default function WhatsappCreate({
  workspaceId,
  settings,
  oauthCallbackUrl,
}: WhatsappCreateProps) {
  const t = useTranslations()
  const router = useRouter()

  const stages = useWhatsappConnectStages({
    onRedirect: (redirectUrl) => router.push(redirectUrl),
  })

  const {
    action,
    form,
    handleSubmitWithAction,
    phoneSelection,
    sessionErrored,
    directCoexist,
    resolveDirectCoexist,
  } = useWhatsappConnectForm({ workspaceId, stages })

  const {
    flow,
    connectOne,
    extraSteps,
    onPickerContinue,
    workspaceId: connectedWorkspaceId,
    resolveCoexistWorkspaceId,
  } = useWhatsappConnectFanout({ form, phoneSelection, stages })

  const { watch, setValue } = form
  const watchConnectExisting = watch(FORM_FIELDS.CONNECT_EXISTING)
  const watchTransferPhoneNumber = watch(FORM_FIELDS.TRANSFER_PHONE_NUMBER)
  const watchManualConnect = watch(FORM_FIELDS.MANUAL_CONNECT)
  // The same predicate the server keys its coexist eligibility check on, read
  // from the live form values — so the picker offers "sync history" exactly
  // when the signup asked Meta for the coexistence flow, and never for a
  // transfer or a manual connect.
  const coexistEligibleMode = isCoexistOnboardingIntent({
    connectExisting: watchConnectExisting,
    transferPhoneNumber: watchTransferPhoneNumber,
    manualConnect: watchManualConnect,
  })

  const visibility = useConnectFormVisibility({
    connectExisting: watchConnectExisting,
    transferPhoneNumber: watchTransferPhoneNumber,
    setValue,
  })

  const renderConnectSection = () => {
    if (phoneSelection) {
      return (
        <>
          {flow.state.kind === "singleSessionError" && (
            <Alert variant="destructive">
              <AlertTitle>
                {t(SESSION_ERROR_MESSAGE_KEYS[flow.state.code])}
              </AlertTitle>
            </Alert>
          )}
          <PhoneNumberSelectionSection
            coexistEligibleMode={coexistEligibleMode}
            isSubmitting={flow.state.kind === "connectingSingle"}
            onSubmit={onPickerContinue}
            phoneNumbers={phoneSelection.phoneNumbers}
          />
        </>
      )
    }

    if (watchManualConnect) {
      return <ManualConnectSection watchManualConnect={watchManualConnect} />
    }

    return (
      <SdkConnectSection
        hasFailed={action.hasErrored || sessionErrored}
        oauthCallbackUrl={oauthCallbackUrl}
        onAutoSubmit={handleSubmitWithAction}
        settings={settings}
        visibility={visibility}
        watchManualConnect={watchManualConnect}
      />
    )
  }

  // Multi-select fan-out (2+ numbers) — the shared overlay owns the status
  // dialog entirely (no Card wrapper); anything else falls through to this
  // component's own render.
  const overlay = renderConnectFlowOverlay({
    channel: "whatsapp",
    connectOne,
    extraSteps,
    flow,
    resolveCoexistWorkspaceId,
    workspaceId: connectedWorkspaceId,
  })
  if (overlay) {
    return overlay
  }

  // Top-level form's own single-shot coexist popup (manual / auto-select) —
  // not part of `flow`, so `renderConnectFlowOverlay` has no visibility
  // into it.
  if (directCoexist) {
    return (
      <CoexistPopup
        channel="whatsapp"
        onDone={resolveDirectCoexist}
        target={{
          integrationId: directCoexist.integrationId,
          name: t("fields.whatsapp.label"),
        }}
        workspaceId={directCoexist.workspaceId}
      />
    )
  }

  const renderCardContent = () => {
    if (
      stages.stage === "verification" &&
      stages.outcome &&
      stages.workspaceId
    ) {
      return (
        <WhatsappPhoneVerificationQueue
          onDone={stages.advance}
          rows={[stages.outcome]}
          workspaceId={stages.workspaceId}
        />
      )
    }

    if (stages.stage === "manualResult" && stages.outcome?.extra?.manual) {
      return (
        <WhatsappOnboardingResult
          onDone={stages.advance}
          results={[stages.outcome.extra.manual]}
        />
      )
    }

    return (
      <Form {...form}>
        <form className="space-y-4" onSubmit={handleSubmitWithAction}>
          {renderConnectSection()}
        </form>
      </Form>
    )
  }

  return (
    <Card className={CONNECT_PICKER_CARD_CLASS}>
      <CardHeader>
        <CardTitle>
          <InboxIcon channel="whatsapp" size="large" />
        </CardTitle>
        <CardDescription />
      </CardHeader>
      <CardContent>{renderCardContent()}</CardContent>
    </Card>
  )
}
