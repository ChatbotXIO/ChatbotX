import { z } from "zod"

// The vocabulary is shared with the publishing rules, which are pure and live in
// `@chatbotx.io/utils`.

export {
  type SocialContentType,
  socialContentTypes,
} from "@chatbotx.io/utils/social-account"
export {
  type SocialMediaKind,
  type SocialPostBucket,
  type SocialPostCreatedVia,
  type SocialPostPartKind,
  type SocialPostPartStatus,
  type SocialPostScheduleMode,
  type SocialPostStatus,
  type SocialPostTargetStatus,
  socialMediaKinds,
  socialPostBuckets,
  socialPostCreatedVia,
  socialPostPartKinds,
  socialPostPartStatuses,
  socialPostScheduleModes,
  socialPostStatuses,
  socialPostTargetStatuses,
} from "@chatbotx.io/utils/social-post"

/** What the recurring-post materialiser decided for one slot of a series. */
export const socialPostRecurrenceOutcomes = z.enum([
  "created",
  "skipped",
  "missed",
  "excluded",
])
export type SocialPostRecurrenceOutcome = z.infer<
  typeof socialPostRecurrenceOutcomes
>
