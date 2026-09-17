import type { FBCommentAutomationModel } from "@chatbotx.io/database/types"
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
import { tiktokCommentResource } from "./resource"

const MAX_NAME_LENGTH = 120
const MAX_REPLY_LENGTH = 2000
const MAX_KEYWORDS = 25
const MAX_POST_IDS = 50
const MAX_KEYWORD_LENGTH = 120
const MAX_POST_ID_LENGTH = 120

const tiktokCommentValidationKeyNames = [
  "postIdsMustBeEmptyForAll",
  "postIdsRequired",
  "keywordsMustBeEmptyForAll",
  "keywordsRequired",
  "delayMustBePositive",
  "delayMustBeZero",
  "hideKeywordsRequired",
  "atLeastOneFieldRequired",
] as const

type TiktokCommentValidationKeyName =
  (typeof tiktokCommentValidationKeyNames)[number]
type TiktokCommentValidationMessageKey =
  `tiktokCommentAutomation.validation.${TiktokCommentValidationKeyName}`

type TiktokCommentValidationMessages = Record<
  TiktokCommentValidationKeyName,
  string
>

export const tiktokCommentValidationKeys = Object.fromEntries(
  tiktokCommentValidationKeyNames.map((key) => [
    key,
    `tiktokCommentAutomation.validation.${key}`,
  ]),
) as Record<TiktokCommentValidationKeyName, TiktokCommentValidationMessageKey>

const defaultTiktokCommentValidationMessages: TiktokCommentValidationMessages =
  tiktokCommentValidationKeyNames.reduce((messages, key) => {
    messages[key] = tiktokCommentValidationKeys[key]
    return messages
  }, {} as TiktokCommentValidationMessages)

export function resolveTiktokCommentValidationMessages(
  resolver: (key: TiktokCommentValidationMessageKey) => string,
): TiktokCommentValidationMessages {
  return tiktokCommentValidationKeyNames.reduce((messages, key) => {
    messages[key] = resolver(tiktokCommentValidationKeys[key])
    return messages
  }, {} as TiktokCommentValidationMessages)
}

const trimmedArray = (maxItems: number, maxLength: number) =>
  z
    .array(z.string().trim().min(1).max(maxLength))
    .max(maxItems)
    .transform((values) => [...new Set(values)])

export function createTiktokCommentRequestSchema(
  validationMessages: TiktokCommentValidationMessages = defaultTiktokCommentValidationMessages,
) {
  const tiktokReplySchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("none"), value: z.null() }),
    z.object({
      type: z.literal("text"),
      value: z.string().trim().min(1).max(MAX_REPLY_LENGTH),
    }),
    z.object({
      type: z.literal("flow"),
      value: zodBigintAsString(),
    }),
    z.object({
      type: z.literal("AIAgent"),
      value: zodBigintAsString(),
    }),
  ])

  const tiktokPostSchema = z
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

  const tiktokIncludeKeywordsSchema = z
    .object({
      type: z.enum(["all", "equal", "contain"]),
      value: trimmedArray(MAX_KEYWORDS, MAX_KEYWORD_LENGTH),
    })
    .superRefine((value, ctx) => {
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

  // `likeUserComment` is here and not on the Threads schema because TikTok
  // really can like a comment. `trackUserTags` stays off the schema entirely —
  // TikTok sends no tagged users, so the service pins it false.
  const tiktokOptionsSchema = z.object({
    replyToNewContactsOnly: z.boolean(),
    replyOncePerUserPerPost: z.boolean(),
    likeUserComment: z.boolean(),
    replyToUsersWhoCommentedOnOtherPosts: z.boolean(),
    ignoreCommentReplies: z.boolean(),
  })

  // `hasImage`/`hasVideo` are absent on purpose: the attachment lookup that
  // answers them is messenger-only, so a TikTok switch would never match.
  const tiktokHideCommentsSchema = z
    .object({
      all: z.boolean(),
      hasPhoneNumber: z.boolean(),
      hasLink: z.boolean(),
      hasKeywords: z.boolean(),
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

  const tiktokReplyAfterSchema = z
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
    post: tiktokPostSchema,
    publicReply: tiktokReplySchema,
    includeKeywords: tiktokIncludeKeywordsSchema,
    excludeKeywords: trimmedArray(MAX_KEYWORDS, MAX_KEYWORD_LENGTH),
    options: tiktokOptionsSchema,
    hideComments: tiktokHideCommentsSchema,
    replyAfter: tiktokReplyAfterSchema,
  })
}

export const listTiktokCommentsRequest = basePaginationRequest.and(
  z.object({
    workspaceId: zodBigintAsString(),
    name: z.string().nullish(),
    isActive: z.boolean().nullish(),
  }),
)
export type ListTiktokCommentsRequest = z.infer<
  typeof listTiktokCommentsRequest
>

export const listTiktokCommentsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString.withDefault(""),
  isActive: parseAsBoolean,
  sort: getSortingStateParser<FBCommentAutomationModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export const listTiktokCommentsResponse = z.object({
  data: z.array(tiktokCommentResource),
  pageCount: z.number(),
})
export type ListTiktokCommentsResponse = z.infer<
  typeof listTiktokCommentsResponse
>

export const createTiktokCommentRequest = createTiktokCommentRequestSchema()
export type CreateTiktokCommentRequest = z.infer<
  typeof createTiktokCommentRequest
>

export const updateTiktokCommentRequest = createTiktokCommentRequest
  .partial()
  .and(
    z.object({
      isActive: z.boolean().optional(),
    }),
  )
  .refine((value) => Object.keys(value).length > 0, {
    message: tiktokCommentValidationKeys.atLeastOneFieldRequired,
  })
export type UpdateTiktokCommentRequest = z.infer<
  typeof updateTiktokCommentRequest
>
