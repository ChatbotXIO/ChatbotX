import {
  socialContentTypes,
  socialPostPartKinds,
  socialPostPartStatuses,
  socialPostRecurrenceOutcomes,
  socialPostStatuses,
  socialProviders,
} from "@chatbotx.io/database/partials"
import {
  postIssueCodes,
  postIssueFields,
  postOptionControls,
} from "@chatbotx.io/utils/post-publishing"
import { postingScheduleSlots } from "@chatbotx.io/utils/posting-slots"
import { recurrenceRuleShape } from "@chatbotx.io/utils/recurrence"
import {
  socialPostCreatedVia,
  socialTargetRemovalStatuses,
} from "@chatbotx.io/utils/social-post"
import { z } from "zod"
import { socialPostCursor } from "./query"
import { socialPostOptions } from "./request"

export const deleteSocialPostResponse = z.object({
  deleted: z
    .boolean()
    .describe(
      "`true` when a draft was deleted or a scheduled post cancelled; `false` for a removal request.",
    ),
  removal: z
    .object({
      targets: z.array(
        z.object({
          status: socialTargetRemovalStatuses,
          targetId: z.string(),
        }),
      ),
    })
    .nullable()
    .describe(
      "The outcome per destination when `removeFromChannels` was asked, else `null`.",
    ),
})

export const socialPostMediaResource = z.object({
  altText: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  height: z.number().int().nullable(),
  id: z.string(),
  kind: z.enum(["image", "video"]),
  mediaLibraryFileId: z.string().nullable(),
  mimeType: z.string(),
  position: z.number().int(),
  size: z.number().int(),
  url: z.string(),
  width: z.number().int().nullable(),
})

const socialPostPartResource = z.object({
  errorCategory: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  externalPostId: z.string().nullable(),
  id: z.string(),
  kind: socialPostPartKinds,
  permalink: z.string().nullable(),
  position: z.number().int(),
  publishedAt: z.date().nullable(),
  status: socialPostPartStatuses,
  text: z.string(),
})

const socialPostTargetResource = z.object({
  contentType: socialContentTypes,
  destination: z.object({
    avatar: z.string().nullable(),
    id: z.string().describe("Destination id (`publishDestinations.list`)."),
    inboxId: z
      .string()
      .nullable()
      .describe(
        "The inbox that publishes (Facebook, Instagram, Threads); `null` for TikTok.",
      ),
    isActive: z.boolean(),
    name: z.string(),
    socialAccountId: z
      .string()
      .nullable()
      .describe("The TikTok publishing login; `null` for the inbox networks."),
    username: z.string().nullable(),
  }),
  errorCategory: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  externalPostId: z.string().nullable(),
  id: z.string(),
  media: z
    .array(socialPostMediaResource)
    .describe(
      "The files this destination publishes: its own when it overrides, else the post's.",
    ),
  options: socialPostOptions,
  overridesMedia: z.boolean(),
  parts: z
    .array(socialPostPartResource)
    .describe(
      "Follow-up parts in publish order (thread parts, then the first comment), each with its own status. The destination stays `processing` until every part is published.",
    ),
  permalink: z.string().nullable(),
  provider: socialProviders,
  publishedAt: z.date().nullable(),
  queueSlotAt: z
    .date()
    .nullable()
    .describe("The posting time the destination holds in its queue."),
  removedAt: z
    .date()
    .nullable()
    .describe(
      "When the post was taken down from the network (`removeFromChannels`). The destination stays `published`.",
    ),
  scheduleMode: z.enum(["custom", "queue"]),
  scheduledAt: z
    .date()
    .nullable()
    .describe("The time the destination publishes (or was asked to)."),
  status: z.enum([
    "pending",
    "publishing",
    "processing",
    "published",
    "failed",
    "cancelled",
    "needsReview",
  ]),
  textOverride: z.string().nullable(),
  timezone: z.string().nullable(),
})

export const socialPostRecurrenceResource = z.object({
  accountedThroughAt: z.date().nullable(),
  endedAt: z.date().nullable(),
  nextRunAt: z
    .date()
    .nullable()
    .describe("The next run to be turned into a post; null once over."),
  occurrenceCount: z
    .number()
    .int()
    .describe("Posts made so far (skipped dates do not count)."),
  pausedAt: z.date().nullable(),
  rule: recurrenceRuleShape,
  state: z.enum(["active", "paused", "ended"]),
  upcoming: z
    .array(
      z.object({
        at: z.date(),
        date: z
          .string()
          .describe("Local date `YYYY-MM-DD` in the rule's zone."),
        excluded: z.boolean().describe("`true` when the date is skipped."),
      }),
    )
    .describe("The next runs, skipped dates included and flagged."),
})

export const socialPostResource = z.object({
  completedAt: z.date().nullable(),
  createdAt: z.date(),
  createdById: z.string().nullable(),
  createdVia: socialPostCreatedVia,
  id: z.string(),
  linkUrl: z.string().nullable(),
  media: z.array(socialPostMediaResource),
  occurrenceAt: z
    .date()
    .nullable()
    .describe(
      "For a post made by a repeating series: the run it was made for.",
    ),
  parentSocialPostId: z
    .string()
    .nullable()
    .describe("For a post made by a repeating series: the template."),
  recurrence: socialPostRecurrenceResource
    .nullable()
    .describe("The repeat schedule when this post is a repeating template."),
  scheduledAt: z
    .date()
    .nullable()
    .describe(
      "The earliest time among the destinations (published, else scheduled): the time the calendar shows.",
    ),
  status: socialPostStatuses,
  targets: z.array(socialPostTargetResource),
  text: z.string().nullable(),
  topics: z.array(
    z.object({
      color: z.string().nullable(),
      id: z.string(),
      name: z.string(),
    }),
  ),
  updatedAt: z.date(),
})

export const listSocialPostsResponse = z.object({
  items: z.array(socialPostResource),
  nextCursor: socialPostCursor.optional(),
})

export const socialPostIssueResource = z.object({
  code: postIssueCodes,
  destinationId: z.string(),
  field: z
    .union([
      postIssueFields,
      z.literal("parts"),
      z.literal("firstComment.text"),
      z.templateLiteral(["parts[", z.number().int(), "].text"]),
    ])
    .describe(
      "What to fix: a target field, `parts` (the list), `parts[i].text` or `firstComment.text`.",
    ),
  message: z.string(),
  partIndex: z
    .number()
    .int()
    .optional()
    .describe(
      "For a part issue: the index among the destination's follow-ups (thread parts first, the first comment last).",
    ),
  targetIndex: z
    .number()
    .int()
    .describe("Index of the target in the request's `targets`."),
})

export const validateSocialPostResponse = z.object({
  issues: z.array(socialPostIssueResource),
  valid: z.boolean(),
})

export const previewSocialPostResponse = z.object({
  items: z.array(
    z.object({
      charactersUsed: z.number().int(),
      contentType: socialContentTypes,
      destinationId: z.string(),
      issues: z.array(socialPostIssueResource),
      linkUrl: z.string().nullable(),
      maxCharacters: z.number().int().nullable(),
      mediaCount: z.number().int(),
      options: socialPostOptions,
      provider: socialProviders,
      targetIndex: z.number().int(),
      text: z.string().nullable(),
    }),
  ),
})

const mediaRuleResource = z.object({
  kind: z.enum(["image", "video"]),
  maxBytes: z.number().int().nullable(),
  maxDurationSeconds: z.number().nullable(),
  mimeTypes: z.array(z.string()).nullable(),
  minDurationSeconds: z.number().nullable(),
})

export const listSocialPostContentTypesResponse = z.object({
  items: z.array(
    z.object({
      contentTypes: z.array(
        z.object({
          contentType: socialContentTypes,
          maxMedia: z.number().int(),
          media: z.array(mediaRuleResource),
          minMedia: z.number().int(),
          optionFields: z.array(
            z.object({
              choices: z
                .array(z.object({ labelKey: z.string(), value: z.string() }))
                .optional()
                .describe(
                  "The values a `select` offers. TikTok's `privacyLevel` is narrowed to the creator's own options (`publishDestinations.getPublishingSettings`).",
                ),
              control: postOptionControls,
              key: z.string(),
              labelKey: z.string(),
              order: z.number().int(),
            }),
          ),
          supportsLink: z.boolean(),
          text: z.object({
            maxLength: z.number().int().nullable(),
            required: z.boolean(),
          }),
        }),
      ),
      canRemove: z
        .boolean()
        .describe(
          "The network's API can take a published post down (`removeFromChannels`).",
        ),
      dailyPostLimit: z.number().int().nullable(),
      parts: z
        .object({
          firstComment: z
            .boolean()
            .describe("A first comment is supported (counted in `maxParts`)."),
          maxPartChars: z.number().int().nullable(),
          maxParts: z
            .number()
            .int()
            .describe("Thread parts and the first comment together."),
        })
        .nullable()
        .describe(
          "Follow-up parts the network publishes; `null` = none (Facebook, Instagram and TikTok: the official comment endpoint is not verified, so first comments are off).",
        ),
      provider: socialProviders,
      textUnit: z
        .enum(["characters", "threadsUtf8Emoji"])
        .describe(
          "How the network counts text. `threadsUtf8Emoji`: characters, except an emoji counts as its UTF-8 bytes.",
        ),
    }),
  ),
})

export const postingScheduleResource = z.object({
  configured: z
    .boolean()
    .describe("`false` until a schedule is set: every day is off."),
  destinationId: z.string(),
  slots: postingScheduleSlots,
  timezone: z.string(),
  updatedAt: z.date().nullable(),
})

export const updatePostingScheduleResponse = z.object({
  reflow: z.object({
    detached: z
      .array(
        z.object({ scheduledAt: z.date().nullable(), targetId: z.string() }),
      )
      .describe(
        "Queued destinations left without a posting time: they keep their time but are no longer queued.",
      ),
    keptCount: z.number().int(),
    moved: z.array(
      z.object({ from: z.date(), targetId: z.string(), to: z.date() }),
    ),
  }),
  schedule: postingScheduleResource,
})

export const listFreeSlotsResponse = z.object({
  items: z.array(z.date()),
  timezone: z.string(),
})

export const listSocialPostOccurrencesResponse = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      localSlot: z
        .string()
        .describe(
          "`YYYY-MM-DD HH:mm` in the rule's zone when the run was taken.",
        ),
      occurrenceAt: z.date(),
      outcome: socialPostRecurrenceOutcomes.describe(
        "`created`: a post was scheduled for the run. `excluded`: a skipped date. `missed`: the run was more than about 6 hours late (the system was not running) and no post was made. `skipped`: the template could not be published as it stood.",
      ),
      postStatus: socialPostStatuses
        .nullable()
        .describe("Current status of the occurrence post."),
      socialPostId: z.string().nullable(),
    }),
  ),
  nextCursor: z
    .object({ id: z.string(), occurrenceAt: z.iso.datetime({ offset: true }) })
    .optional(),
})
