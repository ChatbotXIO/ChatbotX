"use client"

import { useTranslations } from "next-intl"
import type { RefObject } from "react"
import { useEffect, useState } from "react"
import type { WhatsappConnectOutcome } from "../schema"
import { WhatsappPhoneVerificationPanel } from "./whatsapp-phone-verification-panel"

export type WhatsappPhoneVerificationQueueProps = {
  workspaceId: string
  /** Connected outcomes that still need OTP verification — filtered by the caller (`whatsappNeedsVerification`). */
  rows: WhatsappConnectOutcome[]
  titleRef?: RefObject<HTMLHeadingElement | null>
  /** Called once, after the last row in the queue is verified. */
  onDone: () => void
}

/**
 * Verifies a batch of connected phone numbers one at a time, wrapping the
 * existing `WhatsappPhoneVerificationPanel`. The panel has a second consumer
 * (`whatsapps/[id]/account-healths/page.tsx`) that this feature must not
 * disturb, so the only addition to it is the optional `onSkip`, which that
 * page does not pass. Sequential by design: Meta's OTP flow is per-number.
 * Skipping merely moves on — the number stays connected-but-unverified and
 * can be verified later from its account-health page — and is offered even
 * for a single number: in a batch, one number needing OTP must not hold the
 * whole connect hostage.
 *
 * Plain markup for the title — this renders both inside
 * `ConnectManyDialog`'s Base UI `<Dialog>` (as an extra step) and standalone
 * inside a plain `<Card>` (the single-number inline path), so it cannot use
 * `DialogHeader`/`DialogTitle`, which require a Dialog root context that only
 * the first of those two provides.
 */
export function WhatsappPhoneVerificationQueue({
  workspaceId,
  rows,
  titleRef,
  onDone,
}: WhatsappPhoneVerificationQueueProps) {
  const t = useTranslations()
  const [index, setIndex] = useState(0)
  const current = rows[index]
  const extra = current?.integrationId ? current.extra : null

  // A malformed/empty queue finishes itself — as an effect, not during
  // render, since `onDone` (ultimately `router.push` or a dialog-step
  // transition) is a side effect that must not run while React is still
  // rendering this component.
  useEffect(() => {
    if (!extra) {
      onDone()
    }
  }, [extra, onDone])

  if (!(current?.integrationId && extra)) {
    return null
  }

  // Verified and skipped rows advance identically; a skipped number simply
  // keeps its "verification required" state for later.
  const advance = () => {
    if (index + 1 >= rows.length) {
      onDone()
      return
    }
    setIndex((value) => value + 1)
  }
  return (
    <div className="space-y-3">
      <h2 className="mb-1 font-semibold text-lg" ref={titleRef} tabIndex={-1}>
        {t("whatsapp.phoneVerification.title")}
      </h2>
      <p className="text-muted-foreground text-xs">
        {t("whatsapp.phoneVerification.queueProgress", {
          current: index + 1,
          total: rows.length,
        })}
      </p>
      <WhatsappPhoneVerificationPanel
        displayPhoneNumber={extra.displayPhoneNumber}
        integrationId={current.integrationId}
        key={current.integrationId}
        onSkip={advance}
        onVerified={advance}
        registrationError={extra.registrationError}
        verifiedName={extra.verifiedName}
        workspaceId={workspaceId}
      />
    </div>
  )
}
