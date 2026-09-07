"use client"

import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { toast } from "sonner"
import type { FormVisibility } from "../hooks/use-connect-form-visibility"
import { useEmbeddedSignupAutoConnect } from "../hooks/use-embedded-signup-auto-connect"
import { buildFacebookOAuthDialogUrl } from "../libs/embedded-signup"
import { FORM_FIELDS } from "../libs/form-fields"
import type { ConnectWhatsappSchema } from "../schema"
import {
  ManualConnectSection,
  SWITCH_FIELD_CLASS,
} from "./whatsapp-connect-sections"

type SdkConnectSectionProps = {
  visibility: FormVisibility
  watchManualConnect: boolean
  settings: WhatsappCredentialPublic
  /** Submits the connect form without an event, once Meta returns a code. */
  onAutoSubmit: () => void
  /**
   * A failed connect hands the flow back to the user for a fresh signup.
   * `action.hasErrored` catches a genuine framework-level throw (rare now —
   * the action itself never throws a user-visible error); `hasSessionError`
   * catches the typed `{kind:"sessionError"}` result the action returns
   * instead, which `action.hasErrored` alone would never see.
   */
  hasFailed: boolean
  /** Absolute callback URL registered with Meta for this credential. */
  oauthCallbackUrl: string
}

const LAUNCH_BUTTON_CLASS =
  "inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-secondary px-4 py-2 font-medium text-secondary-foreground text-sm shadow-xs transition-all hover:bg-secondary/80 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"

export function SdkConnectSection({
  visibility,
  watchManualConnect,
  settings,
  onAutoSubmit,
  hasFailed,
  oauthCallbackUrl,
}: SdkConnectSectionProps) {
  const t = useTranslations()
  const { control } = useFormContext<ConnectWhatsappSchema>()
  const watchConnectExisting = useWatch({
    control,
    name: FORM_FIELDS.CONNECT_EXISTING,
  })
  const watchTransferPhoneNumber = useWatch({
    control,
    name: FORM_FIELDS.TRANSFER_PHONE_NUMBER,
  })

  const { isConnecting } = useEmbeddedSignupAutoConnect({
    hasFailed,
    onSubmit: onAutoSubmit,
    onRelayError: () =>
      toast.error(t("messages.connectFailed", { feature: "Whatsapp" })),
    callbackOrigin: new URL(oauthCallbackUrl).origin,
  })

  const openFacebookDialog = useCallback(() => {
    const url = buildFacebookOAuthDialogUrl({
      resellerOrigin: window.location.origin,
      redirectUri: oauthCallbackUrl,
      clientId: settings.clientId,
      configId: settings.configId,
      version: settings.version,
      connectExisting: watchConnectExisting,
      transferPhoneNumber: watchTransferPhoneNumber,
      locale: document.documentElement.lang || undefined,
    })
    // Open a real tab (not a popup window) — popups get blocked, and a tab keeps
    // `window.opener` set so the callback route can relay the code back here.
    const authTab = window.open(url, "_blank")
    if (!authTab) {
      toast.error(t("whatsapp.embeddedSignupPopupBlocked"))
    }
  }, [
    settings,
    oauthCallbackUrl,
    watchConnectExisting,
    watchTransferPhoneNumber,
    t,
  ])

  // Once Meta hands back a code the card keeps every option on screen, showing the
  // choices the user made, but freezes all of them: the server re-derives the
  // embedded-signup featureType from these same fields, so flipping one while the
  // connect is in flight would desync it from the dialog the user completed.
  // A disabled fieldset does that natively — a control inside one is `:disabled` per
  // spec, so the existing `disabled:` styles dim it and any field added here later is
  // covered without revisiting this line.
  return (
    <fieldset className="space-y-4" disabled={isConnecting}>
      {visibility.connectExisting && (
        <SwitchField
          formItemClassName={SWITCH_FIELD_CLASS}
          label={t("whatsapp.connectExisting")}
          name={FORM_FIELDS.CONNECT_EXISTING}
          required
        />
      )}

      {visibility.transferPhoneNumber && (
        <SwitchField
          formItemClassName={SWITCH_FIELD_CLASS}
          label={t("whatsapp.transferPhoneNumber")}
          name={FORM_FIELDS.TRANSFER_PHONE_NUMBER}
          required
        />
      )}

      {visibility.manualConnect && (
        <ManualConnectSection watchManualConnect={watchManualConnect} />
      )}

      <div className="flex items-center justify-end gap-2">
        {!watchManualConnect && (
          <EmbeddedSignupButton
            isConnecting={isConnecting}
            onLaunch={openFacebookDialog}
          />
        )}
      </div>
    </fieldset>
  )
}

type EmbeddedSignupButtonProps = {
  /** A code has come back and the connect is in flight. */
  isConnecting: boolean
  onLaunch: () => void
}

/**
 * The card's only action. It launches the Meta dialog, then becomes a frozen status
 * control once a code comes back, so the user can read why the form is busy
 * instead of being able to start a second signup over the first.
 */
function EmbeddedSignupButton({
  isConnecting,
  onLaunch,
}: EmbeddedSignupButtonProps) {
  const t = useTranslations()

  if (isConnecting) {
    return (
      <Button disabled size="sm" type="submit" variant="secondary">
        <Loader2Icon className="animate-spin" />
        {t("whatsapp.autoConnect.inProgress")}
      </Button>
    )
  }

  return (
    <Button className={LAUNCH_BUTTON_CLASS} onClick={onLaunch} type="button">
      {t("actions.continue")}
    </Button>
  )
}
