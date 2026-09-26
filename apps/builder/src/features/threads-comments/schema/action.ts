import {
  COMMENT_REPLY_MAX_TEXTS,
  commentExcludeKeywordsTypes,
  commentIncludeKeywordsSchema,
  resolveReplyTexts,
} from "@chatbotx.io/database/partials"
import type { CommentAutomationModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  createSearchParamsCache,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { basePaginationRequest } from "@/lib/pagination"
import { threadsCommentResource } from "./resource"

const MAX_NAME_LENGTH = 120
const MAX_REPLY_LENGTH = 2000
const MAX_KEYWORDS = 25
const MAX_POST_IDS = 50
const MAX_KEYWORD_LENGTH = 120
const MAX_POST_ID_LENGTH = 120

const threadsCommentValidationKeyNames = [
  "postIdsMustBeEmptyForAll",
  "postIdsRequired",
  "keywordsMustBeEmptyForAll",
  "keywordsRequired",
  "delayMustBePositive",
  "delayMustBeZero",
  "replyTextRequired",
  "hideKeywordsRequired",
  "atLeastOneFieldRequired",
] as const

type ThreadsCommentValidationKeyName =
  (typeof threadsCommentValidationKeyNames)[number]
type ThreadsCommentValidationMessageKey =
  `threadsCommentAutomation.validation.${ThreadsCommentValidationKeyName}`

type ThreadsCommentValidationMessages = Record<
  ThreadsCommentValidationKeyName,
  string
>

export const threadsCommentValidationKeys = Object.fromEntries(
  threadsCommentValidationKeyNames.map((key) => [
    key,
    `threadsCommentAutomation.validation.${key}`,
  ]),
) as Record<ThreadsCommentValidationKeyName, ThreadsCommentValidationMessageKey>

const defaultThreadsCommentValidationMessages: ThreadsCommentValidationMessages =
  threadsCommentValidationKeyNames.reduce((messages, key) => {
    messages[key] = threadsCommentValidationKeys[key]
    return messages
  }, {} as ThreadsCommentValidationMessages)

export function resolveThreadsCommentValidationMessages(
  resolver: (key: ThreadsCommentValidationMessageKey) => string,
): ThreadsCommentValidationMessages {
  return threadsCommentValidationKeyNames.reduce((messages, key) => {
    messages[key] = resolver(threadsCommentValidationKeys[key])
    return messages
  }, {} as ThreadsCommentValidationMessages)
}

const trimmedArray = (maxItems: number, maxLength: number) =>
  z
    .array(z.string().trim().min(1).max(maxLength))
    .max(maxItems)
    .transform((values) => [...new Set(values)])

export function createThreadsCommentRequestSchema(
  validationMessages: ThreadsCommentValidationMessages = defaultThreadsCommentValidationMessages,
) {
  // A `text` public reply is a list of up to COMMENT_REPLY_MAX_TEXTS
  // messages, each posted as its own comment reply — `value` mirrors the
  // first one (see `normalizeReplyTexts`). At least one must be non-empty.
  const threadsReplySchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("none"), value: z.null() }),
    z
      .object({
        type: z.literal("text"),
        value: z.string().trim().max(MAX_REPLY_LENGTH),
        values: z
          .array(z.object({ value: z.string().trim().max(MAX_REPLY_LENGTH) }))
          .max(COMMENT_REPLY_MAX_TEXTS)
          .optional(),
      })
      .refine(
        (reply) =>
          resolveReplyTexts({ ...reply, value: reply.value }).length > 0,
        { message: validationMessages.replyTextRequired, path: ["values"] },
      ),
    z.object({
      type: z.literal("flow"),
      value: zodBigintAsString(),
    }),
    z.object({
      type: z.literal("AIAgent"),
      value: zodBigintAsString(),
    }),
  ])

  const threadsPostSchema = z
    .object({
      type: z.enum(["all", "postIds"]),
      value: trimmedArray(MAX_POST_IDS, MAX_POST_ID_LENGTH),
    })
    .superRefine((value, ctx) => {
      if (value.type === "all" && value.value.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: validationMessages.postIdsMustBeEmptyForAll,
        })
      }
      if (value.type === "postIds" && value.value.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: validationMessages.postIdsRequired,
        })
      }
    })

  // The shared schema owns the include types and the `mentionCount` rule, so
  // the worker, the Meta channels and this form cannot drift; only `value`
  // gets this form's length limits on top.
  const threadsIncludeKeywordsSchema = commentIncludeKeywordsSchema
    .extend({ value: trimmedArray(MAX_KEYWORDS, MAX_KEYWORD_LENGTH) })
    .superRefine((value, ctx) => {
      // `mentions` ignores keywords entirely — the worker never reads them.
      if (value.type === "mentions") {
        return
      }
      if (value.type === "all" && value.value.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: validationMessages.keywordsMustBeEmptyForAll,
        })
      }
      if (value.type !== "all" && value.value.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: validationMessages.keywordsRequired,
        })
      }
    })

  const threadsOptionsSchema = z.object({
    replyToNewContactsOnly: z.boolean(),
    replyOncePerUserPerPost: z.boolean(),
    replyToUsersWhoCommentedOnOtherPosts: z.boolean(),
    ignoreCommentReplies: z.boolean(),
    trackUserTags: z.boolean().optional(),
  })

  // Threads hides a top-level reply via `manage_reply` and exposes its
  // `gif_url`. `hasImage`/`hasVideo` are absent: no attachment lookup exists.
  const threadsHideCommentsSchema = z
    .object({
      all: z.boolean(),
      hasPhoneNumber: z.boolean(),
      hasLink: z.boolean(),
      hasKeywords: z.boolean(),
      hasGif: z.boolean().optional(),
      hasEmoji: z.boolean().optional(),
      keywords: trimmedArray(MAX_KEYWORDS, MAX_KEYWORD_LENGTH),
      showCommentsAfter: z.enum([
        "none",
        "6h",
        "12h",
        "1d",
        "2d",
        "3d",
        "4d",
        "5d",
        "6d",
        "7d",
        "8d",
        "9d",
        "10d",
      ]),
    })
    .superRefine((value, ctx) => {
      if (value.hasKeywords && value.keywords.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["keywords"],
          message: validationMessages.hideKeywordsRequired,
        })
      }
    })

  const threadsReplyAfterSchema = z
    .object({
      type: z.enum([
        "immediately",
        "seconds",
        "minutes",
        "hours",
        "randomWithin3Minutes",
        "randomWithin5Minutes",
        "randomWithin10Minutes",
        "randomWithin20Minutes",
        "randomWithin30Minutes",
        "randomWithin60Minutes",
      ]),
      value: z.coerce
        .number()
        .int()
        .min(0)
        .max(24 * 60 * 60),
    })
    .superRefine((value, ctx) => {
      const requiresValue = ["seconds", "minutes", "hours"].includes(value.type)
      if (requiresValue && value.value <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: validationMessages.delayMustBePositive,
        })
      }
      if (!requiresValue && value.value !== 0) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: validationMessages.delayMustBeZero,
        })
      }
    })

  return z.object({
    name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
    post: threadsPostSchema,
    publicReply: threadsReplySchema,
    includeKeywords: threadsIncludeKeywordsSchema,
    excludeKeywords: trimmedArray(MAX_KEYWORDS, MAX_KEYWORD_LENGTH),
    // Optional, never defaulted here: the update schema is this one made
    // `.partial()`, and a default would reset the stored match type on every
    // PATCH that did not mention it. The column defaults to `contain`.
    excludeKeywordsType: commentExcludeKeywordsTypes.optional(),
    options: threadsOptionsSchema,
    hideComments: threadsHideCommentsSchema.optional(),
    replyAfter: threadsReplyAfterSchema,
  })
}

export const listThreadsCommentsRequest = basePaginationRequest.and(
  z.object({
    workspaceId: zodBigintAsString(),
    name: z.string().nullish(),
    isActive: z.boolean().nullish(),
  }),
)
export type ListThreadsCommentsRequest = z.infer<
  typeof listThreadsCommentsRequest
>

export const listThreadsCommentsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString.withDefault(""),
  isActive: parseAsBoolean,
  sort: getSortingStateParser<CommentAutomationModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export const listThreadsCommentsResponse = z.object({
  data: z.array(threadsCommentResource),
  pageCount: z.number(),
})
export type ListThreadsCommentsResponse = z.infer<
  typeof listThreadsCommentsResponse
>

export const createThreadsCommentRequest = createThreadsCommentRequestSchema()
export type CreateThreadsCommentRequest = z.infer<
  typeof createThreadsCommentRequest
>

export const updateThreadsCommentRequest = createThreadsCommentRequest
  .partial()
  .and(
    z.object({
      isActive: z.boolean().optional(),
    }),
  )
  .refine((value) => Object.keys(value).length > 0, {
    message: threadsCommentValidationKeys.atLeastOneFieldRequired,
  })
export type UpdateThreadsCommentRequest = z.infer<
  typeof updateThreadsCommentRequest
>
