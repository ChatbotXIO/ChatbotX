import type { MinigamePlayerSettings } from "@chatbotx.io/database/partials"

type PlayerSettingsFormValue = Partial<MinigamePlayerSettings> | undefined

/**
 * Rebuilds `playerSettings` for a new reset policy.
 *
 * `minigamePlayerSettingsSchema` is a discriminated union, so switching
 * policies has to replace the whole object rather than just `resetPolicy` —
 * which means every field shared by both branches must be carried over here
 * by hand. TypeScript will NOT catch an omission: a narrower object literal
 * still satisfies the branch type, so a dropped field just silently resets to
 * its default. Dropping `sharingNodeId` in particular would switch sharing
 * off and strand every share link already in circulation.
 *
 * Extracted from the form so that contract is unit-testable.
 */
export function buildPlayerSettingsForResetPolicy(
  current: PlayerSettingsFormValue,
  resetPolicy: MinigamePlayerSettings["resetPolicy"],
): MinigamePlayerSettings {
  const shared = {
    drawsPerPerson: current?.drawsPerPerson ?? 1,
    maxSharesPerPerson: current?.maxSharesPerPerson ?? 0,
    sharingFlowId: current?.sharingFlowId ?? null,
    sharingNodeId: current?.sharingNodeId ?? null,
  }

  if (resetPolicy === "never") {
    return { ...shared, resetPolicy: "never" }
  }

  return {
    ...shared,
    resetPolicy: "everyNDays",
    resetIntervalDays:
      current?.resetPolicy === "everyNDays"
        ? (current.resetIntervalDays ?? 1)
        : 1,
  }
}
