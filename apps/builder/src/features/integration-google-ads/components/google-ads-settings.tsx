"use client"

import type { ConnectErrorQueryCode } from "@chatbotx.io/utils/connection"
import type { GoogleAdsSettingsView } from "../lib/to-settings-view"
import type { GoogleAdsConsentView } from "../schema/integration"
import { AccountPicker } from "./account-picker"
import { ConnectErrorAlert } from "./connect-error-alert"
import { ConnectionRow } from "./connection-row"
import { ConsentSection } from "./consent-section"
import { ConversionActionsSection } from "./conversion-actions-section"
import { EventsHistorySection } from "./events-history-section"

type GoogleAdsSettingsProps = {
  workspaceId: string
  /** False when the owner's `google` platform credential has no developer token. */
  isConfigured: boolean
  setup: GoogleAdsSettingsView | null
  /** Stored conversion data consent; loaded even when nothing is connected. */
  consent: GoogleAdsConsentView
  /** The workspace's in-flight connect session, resumed after the OAuth round-trip. */
  initialSession: { id: string; status: string } | null
  /** Why the connect attempt that just returned did not finish (`?connect_error=`), already validated. */
  connectError?: ConnectErrorQueryCode | null
}

export const GoogleAdsSettings = ({
  workspaceId,
  isConfigured,
  setup,
  consent,
  initialSession,
  connectError = null,
}: GoogleAdsSettingsProps) => {
  return (
    <div className="flex min-w-0 flex-col divide-y *:py-6 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
      {connectError ? (
        <div className="pb-4">
          <ConnectErrorAlert code={connectError} workspaceId={workspaceId} />
        </div>
      ) : null}
      <ConnectionRow
        isConfigured={isConfigured}
        setup={setup}
        workspaceId={workspaceId}
      />
      {isConfigured || setup ? (
        <AccountPicker
          hasConnectError={connectError !== null}
          initialSession={initialSession}
          workspaceId={workspaceId}
        />
      ) : null}
      {setup ? (
        <ConversionActionsSection setup={setup} workspaceId={workspaceId} />
      ) : null}
      <ConsentSection
        consent={consent}
        uploadMethod={setup?.uploadMethod ?? null}
        workspaceId={workspaceId}
      />
      {/* Events outlive the connection (the FKs are set null on disconnect), so history never depends on `setup`. */}
      <EventsHistorySection
        isConnected={setup !== null}
        workspaceId={workspaceId}
      />
    </div>
  )
}
