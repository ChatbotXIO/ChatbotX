import { ChatbotXException } from "../errors"
import { logger } from "../logger"
import { socialAccountOperationService } from "../social-account/operations"

type ContentTarget = {
  destinationId: string
  options?: Record<string, boolean | number | string> | undefined
}

export type CreatorSettingsIssue = {
  code: "destinationInactive" | "optionsInvalid"
  destinationId: string
  field: "destination" | "options"
  message: string
  targetIndex: number
}

/**
 * The issue of one TikTok target, or null. Settings are cached (Redis, 30 s) by
 * `publishingSettings`: TikTok allows 20 creator-info reads a minute per token
 * and a composer validates on every edit.
 */
const issueFor = async (
  workspaceId: string,
  target: ContentTarget,
  targetIndex: number,
): Promise<CreatorSettingsIssue | null> => {
  try {
    const settings = await socialAccountOperationService.publishingSettings({
      destinationId: target.destinationId,
      workspaceId,
    })
    const level = target.options?.privacyLevel
    if (!settings.canPostNow) {
      return {
        code: "destinationInactive",
        destinationId: target.destinationId,
        field: "destination",
        message: `The TikTok account cannot post right now (${settings.cannotPostReason ?? "unavailable"}).`,
        targetIndex,
      }
    }
    if (
      typeof level === "string" &&
      !settings.privacyLevelOptions.includes(level)
    ) {
      return {
        code: "optionsInvalid",
        destinationId: target.destinationId,
        field: "options",
        message:
          'The setting "privacyLevel" is not one of the options the TikTok account offers.',
        targetIndex,
      }
    }
  } catch (error) {
    // Not a TikTok destination: it has no creator settings to compare.
    if (
      error instanceof ChatbotXException &&
      (error.code === "publishingSettingsNotSupported" ||
        error.code === "notFound")
    ) {
      return null
    }
    logger.info(
      { err: error, destinationId: target.destinationId },
      "TikTok creator settings could not be read while validating",
    )
  }
  return null
}

/**
 * Checks the live creator settings of every target that chose a privacy level
 * (only a TikTok destination has one; a target without it is not read at all):
 * the level must be one the creator offers (TikTok:
 * `privacy_level_option_mismatch`) and the creator must be able to post now.
 * The privacy issue names the setting
 * (`privacyLevel`) so the composer can point at it. A creator-info outage adds
 * no issue: the TikTok publisher checks the creator info again right before
 * posting (`integrations/tiktok/src/publisher.ts`), which covers the worker.
 */
export const creatorSettingsIssues = async (
  workspaceId: string,
  targets: readonly ContentTarget[],
): Promise<CreatorSettingsIssue[]> => {
  // Only a target that already chose a privacy level has anything to compare;
  // a missing one is the registry's own issue. A target that is not a TikTok
  // destination answers `publishingSettingsNotSupported` and adds no issue.
  const perTarget = await Promise.all(
    targets.map((target, targetIndex) =>
      typeof target.options?.privacyLevel === "string"
        ? issueFor(workspaceId, target, targetIndex)
        : Promise.resolve(null),
    ),
  )
  return perTarget.filter(
    (issue): issue is CreatorSettingsIssue => issue !== null,
  )
}
