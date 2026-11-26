import { socialContentTypes } from "@chatbotx.io/database/partials"
import { zodBigintIdAsString } from "@chatbotx.io/utils"
import { MAX_POST_PARTS } from "@chatbotx.io/utils/post-publishing"
import { postingScheduleSlots } from "@chatbotx.io/utils/posting-slots"
import { recurrenceRuleSchema } from "@chatbotx.io/utils/recurrence"
import { socialQueuePositions } from "@chatbotx.io/utils/social-post"
import { z } from "zod"

export const MAX_TEXT_LENGTH = 5000
const MAX_URL_LENGTH = 2048
const MAX_MEDIA = 20
const MAX_TARGETS = 20
export const MAX_TOPICS = 20
const MAX_KEY_LENGTH = 200

export const postId = zodBigintIdAsString()

/** An ISO 8601 instant with an offset (`2026-12-01T09:00:00+07:00` or `...Z`). */
const isoInstant = z.iso.datetime({ offset: true })
const timezoneName = z.string().trim().min(1).max(100)
const scheduledAtField = isoInstant.describe(
  "ISO 8601 time with an offset, e.g. `2026-12-01T09:00:00+07:00`: at least 2 minutes from now and within one year.",
)
const timezoneField = timezoneName.describe(
  "IANA time zone the times are shown in (e.g. `Asia/Ho_Chi_Minh`). Defaults to the workspace's time zone. The instant comes from `scheduledAt`'s offset; the zone is kept to display the post and to follow the destination's posting schedule.",
)
const queueField = socialQueuePositions.describe(
  "`next`: take the destination's next free posting time. `top`: take the first posting time and push the queued posts one time later. Needs the destination's posting schedule (`publishDestinations.updatePostingSlots`).",
)

const socialMediaInput = z
  .strictObject({
    altText: z
      .string()
      .max(1000)
      .nullable()
      .optional()
      .describe("Alternative text for an image."),
    mediaLibraryFileId: zodBigintIdAsString()
      .optional()
      .describe("A file already in the Media Library (`media.*`)."),
    url: z
      .url()
      .max(MAX_URL_LENGTH)
      .optional()
      .describe(
        "A public image or video URL to import into the Media Library. It must be reachable from the internet.",
      ),
  })
  .refine((media) => Boolean(media.mediaLibraryFileId) !== Boolean(media.url), {
    message: "Give either mediaLibraryFileId or url, not both",
  })

const optionValue = z.union([z.boolean(), z.string().max(200), z.number()])
export const socialPostOptions = z
  .record(z.string().max(64), optionValue)
  .describe(
    "Settings of the content type; see `socialPosts.contentTypes` (`optionFields`).",
  )

/** One follow-up of a destination: text only. */
const socialPostPartInput = z.strictObject({
  text: z
    .string()
    .max(MAX_TEXT_LENGTH)
    .describe(
      "The text. The network's own limit applies (`socialPosts.contentTypes` → `parts`); `validate` reports a part over it.",
    ),
})

const socialPostTargetInput = z
  .strictObject({
    contentType: socialContentTypes
      .optional()
      .describe(
        "Omit to derive it from the files: none → `text` (or `link` on Facebook), one image → `image`, one video → `video` (`reel` on Instagram), several → `carousel`.",
      ),
    destinationId: postId
      .optional()
      .describe(
        "A destination id from `publishDestinations.list` (`destinations[].id`). Give exactly one of `destinationId` or `inboxId`.",
      ),
    inboxId: postId
      .optional()
      .describe(
        "The inbox (Facebook Page, Instagram or Threads channel) to publish with, from `inboxes.list`; its destination is created when missing. Give exactly one of `destinationId` or `inboxId`.",
      ),
    media: z
      .array(socialMediaInput)
      .max(MAX_MEDIA)
      .nullable()
      .optional()
      .describe(
        "Omit or `null` to use the post's files; an array (even empty) replaces them for this destination.",
      ),
    firstComment: socialPostPartInput
      .nullable()
      .optional()
      .describe(
        "A comment published after the post and every part. Only on networks whose `socialPosts.contentTypes` entry has `parts.firstComment`.",
      ),
    options: socialPostOptions.optional(),
    parts: z
      .array(socialPostPartInput)
      .max(MAX_POST_PARTS)
      .optional()
      .describe(
        "Follow-up parts, in order: each is published as a reply to the one before it, after the post. Text only. Only on networks whose `socialPosts.contentTypes` entry has `parts` (Threads). Omit to publish no parts; an edit replaces them as a whole.",
      ),
    scheduledAt: scheduledAtField
      .optional()
      .describe(
        "A time of its own for this destination (ISO 8601 with an offset), instead of the post's `scheduledAt` or queue. Ignored by `validate` and `preview`.",
      ),
    text: z
      .string()
      .max(MAX_TEXT_LENGTH)
      .nullable()
      .optional()
      .describe(
        "Replaces the post's text for this destination. `null` or omitted keeps the post's text.",
      ),
  })
  .refine(
    (target) => Boolean(target.destinationId) !== Boolean(target.inboxId),
    { message: "Give exactly one of destinationId or inboxId" },
  )

export const socialPostContentInput = z.strictObject({
  linkUrl: z
    .url()
    .max(MAX_URL_LENGTH)
    .nullable()
    .optional()
    .describe("A link to share (Facebook `link` posts)."),
  media: z
    .array(socialMediaInput)
    .max(MAX_MEDIA)
    .optional()
    .describe("Files shared by every destination that does not override them."),
  targets: z
    .array(socialPostTargetInput)
    .min(1)
    .max(MAX_TARGETS)
    .describe("Where to publish; each destination at most once."),
  text: z
    .string()
    .max(MAX_TEXT_LENGTH)
    .nullable()
    .optional()
    .describe(
      "The text every destination publishes unless it overrides it. The limit depends on the network: see `socialPosts.contentTypes`.",
    ),
  topicIds: z
    .array(postId)
    .max(MAX_TOPICS)
    .optional()
    .describe("Topics from `postTopics.list`."),
})

const plannedAtField = isoInstant.describe(
  "A time to remember on a DRAFT, ISO 8601 with an offset. It only places the draft on its day in the calendar: nothing is scheduled and nothing is published at that time. Cannot be combined with `publish`, `scheduledAt`, `queue` or `recurrence`; to publish at a time, give `scheduledAt`.",
)

export const createSocialPostRequest = socialPostContentInput.extend({
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .max(MAX_KEY_LENGTH)
    .optional()
    .describe(
      "Makes the create safe to repeat: the same key with the same request returns the post already made; with a different request it answers 409.",
    ),
  signatureId: postId
    .optional()
    .describe(
      "A `signature` snippet from `postSnippets.list`. Its text is appended once to the post's shared `text` (after a blank line) when the post is created; the stored text is what gets published, and an update never appends it again. Destinations with a `text` of their own do not get it.",
    ),
  plannedAt: plannedAtField.optional(),
  publish: z
    .enum(["draft", "now", "queue"])
    .optional()
    .describe(
      '`draft` (default) saves the post; `now` saves it and publishes every destination at once; `queue` puts every destination at the next free posting time of its queue (same as `queue: "next"`). A post is refused whole when any destination cannot publish it as composed. To pick a time, give `scheduledAt` instead.',
    ),
  queue: queueField.optional(),
  recurrence: recurrenceRuleSchema
    .optional()
    .describe(
      "Makes the post repeat: it is saved as a draft template that is never published itself, and a copy is scheduled at each run of the rule (`socialPosts.listOccurrences`). Cannot be combined with `publish`, `scheduledAt` or `queue`.",
    ),
  scheduledAt: scheduledAtField
    .optional()
    .describe(
      "Schedules every destination (without a time of its own) at this time: ISO 8601 with an offset, at least 2 minutes from now and within one year.",
    ),
  timezone: timezoneField.optional(),
})

export const socialPostIdRequest = z.object({
  id: postId.describe("Post id. Get it from `socialPosts.list`."),
})

const removeFromChannelsField = z
  .boolean()
  .optional()
  .describe(
    "`true` takes the published destinations down from their networks instead of deleting a draft or cancelling a schedule. The post stays as history; each destination answers `queued` (a worker removes it; `removedAt` or the destination's error tells the result), `removed` (already gone), `unsupported` (the network offers no delete, so it stays published) or `notPublished`. Not allowed in a workspace whose plan has expired.",
  )

/** Private (body) form of the delete request. */
export const deleteSocialPostRequest = socialPostIdRequest.extend({
  removeFromChannels: removeFromChannelsField,
})

/** Public (path + query) form of the delete request. */
export const deleteSocialPostQueryRequest = z.object({
  params: socialPostIdRequest,
  query: z.object({
    removeFromChannels: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional()
      .describe(
        removeFromChannelsField.description ?? "Remove from the networks.",
      ),
  }),
})

export const updateSocialPostRequest = socialPostIdRequest
  .extend({
    linkUrl: socialPostContentInput.shape.linkUrl,
    media: socialPostContentInput.shape.media.describe(
      "Replaces the shared files. Omit to keep them.",
    ),
    targets: socialPostContentInput.shape.targets
      .optional()
      .describe(
        "The complete new set of destinations: one left out is removed, one kept is updated. Omit to keep them.",
      ),
    plannedAt: plannedAtField
      .nullable()
      .optional()
      .describe(
        "Remembers (or, with `null`, forgets) the time a DRAFT is planned for: it only places the draft on its day in the calendar, nothing is scheduled. Ignored by destinations that already wait for a time. Cannot be combined with `publish`, `scheduledAt`, `queue` or `recurrence`.",
      ),
    publish: z
      .enum(["now"])
      .optional()
      .describe(
        "`now` publishes the post after saving the changes. Omit to only save.",
      ),
    queue: queueField.optional(),
    recurrence: recurrenceRuleSchema
      .optional()
      .describe(
        "Sets or replaces the repeat rule of a draft (see `socialPosts.setRecurrence`). Omit to keep it.",
      ),
    scheduledAt: scheduledAtField
      .optional()
      .describe(
        "Schedules every destination (without a time of its own) at this time after saving the changes. Omit to keep the current schedule.",
      ),
    timezone: timezoneField.optional(),
    text: socialPostContentInput.shape.text,
    topicIds: socialPostContentInput.shape.topicIds,
  })
  .strict()

export const rescheduleSocialPostRequest = socialPostIdRequest
  .extend({
    queue: queueField.optional(),
    scheduledAt: scheduledAtField.optional(),
    targetId: postId
      .optional()
      .describe(
        "Only this destination (`targets[].id`). Omit to move every destination that is still waiting.",
      ),
    timezone: timezoneField
      .optional()
      .describe(
        "With `scheduledAt`: the zone to show the time in. Alone: change the zone and keep the wall-clock time (09:00 stays 09:00 in the new zone). A queued destination follows its posting schedule: change that schedule's zone instead.",
      ),
    unschedule: z
      .boolean()
      .optional()
      .describe(
        "`true` takes the waiting destinations out of the schedule and queue: the post goes back to a draft.",
      ),
  })
  .strict()

export const unscheduleSocialPostRequest = rescheduleSocialPostRequest
  .pick({ id: true, targetId: true })
  .strict()

export const socialPostTargetIdRequest = socialPostIdRequest.extend({
  partId: postId
    .optional()
    .describe(
      "A part id (`targets[].parts[].id`). Only needed to be explicit: a destination whose first post is published always acts on its first part that is not published, and any other part answers 409 `socialPostPartNotResumable`.",
    ),
  targetId: postId.describe(
    "Target id: `targets[].id` of the post. Get it from `socialPosts.get`.",
  ),
})

const socialPostTargetResolutions = z.enum(["published", "retry"])

export const resolveSocialPostTargetRequest = socialPostTargetIdRequest
  .extend({
    outcome: socialPostTargetResolutions.describe(
      "`published`: the post is on the network, mark it published. `retry`: it is not (or you accept a second post), publish again.",
    ),
  })
  .strict()

export const validateSocialPostRequest = socialPostContentInput

export const previewSocialPostRequest = socialPostContentInput

export const destinationScheduleRequest = z.object({
  id: postId.describe(
    "Destination id. Get it from `publishDestinations.list` (`destinations[].id`).",
  ),
})

export const updatePostingScheduleRequest = destinationScheduleRequest
  .extend({
    slots: postingScheduleSlots.describe(
      'Seven items, one per weekday (`0` = Sunday … `6` = Saturday): `{weekday, enabled, times: ["HH:mm"]}`, at most 10 times a day, as local times in `timezone`.',
    ),
    timezone: timezoneName
      .optional()
      .describe(
        "IANA time zone of the times. Omit to keep the current one (the workspace's zone for a new schedule). Changing it keeps each queued post on the same local time when that time is still a posting time.",
      ),
  })
  .strict()

export const setSocialPostRecurrenceRequest = socialPostIdRequest
  .extend({
    rule: recurrenceRuleSchema.describe(
      "How often and when the post repeats, in the rule's time zone. Starts counting from now: runs before now are not made up.",
    ),
  })
  .strict()

const recurrenceDatesField = z
  .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  .min(1)
  .max(100)
  .describe(
    "Local dates `YYYY-MM-DD` in the rule's time zone (see `recurrence.upcoming[].date`).",
  )

export const setSocialPostOccurrencesSkippedRequest = socialPostIdRequest
  .extend({ dates: recurrenceDatesField })
  .strict()
