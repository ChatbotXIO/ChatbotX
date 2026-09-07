"use client"

import type { ConnectDialogExtraStep } from "@/features/channel-connect/components/connect-many-dialog"
import type { ConnectOutcome } from "@/features/channel-connect/schema"
import {
  whatsappHasManualResult,
  whatsappNeedsVerification,
} from "../libs/connect-stages"
import {
  type WhatsappConnectOutcome,
  whatsappConnectOutcomeSchema,
} from "../schema"
import { WhatsappPhoneVerificationQueue } from "../verification/whatsapp-phone-verification-queue"
import { WhatsappOnboardingResult } from "./whatsapp-onboarding-result"

/**
 * `ConnectManyDialog` only knows the base `ConnectOutcome` shape; every
 * WhatsApp outcome it hands back here actually satisfies
 * `whatsappConnectOutcomeSchema` (this action is the only thing that
 * produces them), so this parses rather than blindly casting — a shape
 * drift between the action and this file fails loudly instead of silently
 * reading `undefined` off a mismatched `extra`.
 */
function asWhatsappOutcomes(
  outcomes: ConnectOutcome[],
): WhatsappConnectOutcome[] {
  return outcomes.map((outcome) => whatsappConnectOutcomeSchema.parse(outcome))
}

export type BuildWhatsappConnectExtraStepsParams = {
  workspaceId: string
}

/**
 * The dialog-side half of the WhatsApp connect stage sequence (plan §3.4):
 * "coexist" is already handled by `ConnectManyDialog`'s own built-in step for
 * any coexist-eligible channel, so this registers only "verification" and
 * "manualResult" — table-driven from the same predicates the single-number
 * inline path uses (`hooks/use-whatsapp-connect-stages.ts`,
 * `libs/connect-stages.ts`), so the two flows can never disagree on which
 * stage a given outcome needs.
 *
 * Each step hands completion to the dialog's `onNext`, which advances to the
 * next applicable step or finishes the sequence when this was the last one —
 * the steps never need to know whether another follows.
 */
export function buildWhatsappConnectExtraSteps(
  params: BuildWhatsappConnectExtraStepsParams,
): ConnectDialogExtraStep[] {
  const { workspaceId } = params

  return [
    {
      id: "verification",
      labelKey: "whatsapp.phoneVerification.title",
      isApplicable: (outcomes) =>
        asWhatsappOutcomes(outcomes).some(whatsappNeedsVerification),
      render: ({ outcomes, titleRef, onNext }) => {
        const rows = asWhatsappOutcomes(outcomes).filter(
          whatsappNeedsVerification,
        )

        return (
          <WhatsappPhoneVerificationQueue
            onDone={onNext}
            rows={rows}
            titleRef={titleRef}
            workspaceId={workspaceId}
          />
        )
      },
    },
    {
      id: "manualResult",
      labelKey: "whatsapp.manualOnboarding.title",
      isApplicable: (outcomes) =>
        asWhatsappOutcomes(outcomes).some(whatsappHasManualResult),
      render: ({ outcomes, titleRef, onNext, isLeaving }) => {
        const results = asWhatsappOutcomes(outcomes)
          .filter(whatsappHasManualResult)
          .map((outcome) => outcome.extra?.manual)
          .filter((result): result is NonNullable<typeof result> =>
            Boolean(result),
          )

        return (
          <WhatsappOnboardingResult
            isDone={isLeaving}
            onDone={onNext}
            results={results}
            titleRef={titleRef}
          />
        )
      },
    },
  ]
}
