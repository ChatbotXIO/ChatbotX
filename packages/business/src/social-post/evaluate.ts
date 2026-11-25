import type {
  SocialContentType,
  SocialProvider,
} from "@chatbotx.io/database/partials"
import { socialPostRepository } from "@chatbotx.io/database/repositories"
import {
  inferContentType,
  type MediaSpec,
  type NormalisedTarget,
  normalisePublishTarget,
  type PostIssue,
  ruleFor,
  validateParts,
} from "@chatbotx.io/utils/post-publishing"
import type { PublishDestinationState } from "@chatbotx.io/utils/publish-destination"
import { specsOf } from "./media"
import { orderedParts } from "./parts"
import type {
  SocialMediaInput,
  SocialPostContentInput,
  SocialPostIssue,
} from "./types"

export type TargetEvaluation = {
  contentType: SocialContentType
  destinationId: string
  normalised: NormalisedTarget
  provider: SocialProvider | null
  targetIndex: number
}

const toPostIssue = (
  issue: PostIssue,
  destinationId: string,
  targetIndex: number,
): SocialPostIssue => ({ ...issue, destinationId, targetIndex })

/** Why a destination cannot publish, or nothing when it is `ready`. */
export const destinationIssue = (
  destination: { state: PublishDestinationState } | undefined,
): PostIssue | null => {
  if (!destination) {
    return {
      code: "destinationNotFound",
      field: "destination",
      message: "The destination was not found.",
    }
  }
  switch (destination.state) {
    case "ready":
      return null
    case "inboxDisconnected":
      return {
        code: "inboxDisconnected",
        field: "destination",
        message: "The channel behind this destination is disconnected.",
      }
    case "needsReconnect":
      return {
        code: "inboxNeedsReconnect",
        field: "destination",
        message: "The connection expired. Reconnect it before publishing.",
      }
    default:
      return {
        code: "publishPermissionMissing",
        field: "destination",
        message:
          "Publishing permission was not granted. Reconnect to allow publishing.",
      }
  }
}

/**
 * Applies the publishing rules to every target of a post as composed. One
 * function behind `validate` and `preview`, so they cannot disagree with the
 * publisher. Nothing is imported or written.
 */
export const evaluateContent = async (
  workspaceId: string,
  content: SocialPostContentInput,
): Promise<{ evaluations: TargetEvaluation[]; issues: SocialPostIssue[] }> => {
  const destinations = await socialPostRepository.findDestinations({
    ids: content.targets.map((target) => target.destinationId),
    workspaceId,
  })
  const byId = new Map(destinations.map((row) => [row.id, row]))
  const sharedSpecs = await specsOf(workspaceId, content.media ?? [])
  const overrideSpecs = new Map<number, MediaSpec[]>()
  for (const [index, target] of content.targets.entries()) {
    if (target.media) {
      overrideSpecs.set(
        index,
        await specsOf(workspaceId, target.media as SocialMediaInput[]),
      )
    }
  }

  const evaluations: TargetEvaluation[] = []
  const issues: SocialPostIssue[] = []
  for (const [targetIndex, target] of content.targets.entries()) {
    const destination = byId.get(target.destinationId)
    const media = overrideSpecs.get(targetIndex) ?? sharedSpecs
    const provider = destination?.provider ?? null
    const contentType =
      target.contentType ??
      (provider
        ? inferContentType({
            hasLink: Boolean(content.linkUrl),
            media,
            provider,
          })
        : "text")
    const blocker = destinationIssue(destination)
    const normalised = provider
      ? normalisePublishTarget({
          contentType,
          linkUrl: content.linkUrl ?? null,
          media,
          options: target.options,
          provider,
          text: target.text ?? content.text ?? null,
        })
      : {
          issues: [],
          linkUrl: content.linkUrl ?? null,
          media,
          options: {},
          text: target.text ?? content.text ?? null,
        }
    evaluations.push({
      contentType,
      destinationId: target.destinationId,
      normalised,
      provider,
      targetIndex,
    })
    for (const issue of [...(blocker ? [blocker] : []), ...normalised.issues]) {
      issues.push(toPostIssue(issue, target.destinationId, targetIndex))
    }
    if (provider) {
      for (const issue of validateParts(provider, orderedParts(target))) {
        issues.push({
          ...issue,
          destinationId: target.destinationId,
          targetIndex,
        })
      }
    }
  }
  return { evaluations, issues }
}

/** The content type must exist for the destination's network (even for a draft). */
export const contentTypeIsKnown = (
  provider: SocialProvider,
  contentType: SocialContentType,
): boolean => ruleFor(provider, contentType) !== undefined
