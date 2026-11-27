import { z } from "zod"
import type { SocialContentType, SocialProvider } from "./social-account"
import type { SocialMediaKind } from "./social-post"
import type { PublisherKey } from "./social-publisher"

/**
 * What each network accepts through its publishing API, per content type. Pure
 * data and functions (no Node imports) so the composer, `validate`, `preview`
 * and the publisher all read one source. Only numbers the platform documents
 * are filled in; `null` means "not documented / not checked here" and is listed
 * in docs/posts.md as unverified. A content type with `enabled: false` is not
 * offered yet (its publish path is not verified).
 *
 * Sources (Meta for Developers):
 * - Instagram "Content Publishing" and "IG User Media" (image / reel / story
 *   specifications, caption 2,200 characters, carousel up to 20, 100 posts per
 *   24 hours, `share_to_feed`, `thumb_offset`):
 *   https://developers.facebook.com/docs/instagram-platform/content-publishing
 *   https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
 * - Threads "Threads posts" (text 500 characters, carousel 2-20, image and
 *   video specifications) and publishing reference (250 posts per 24 hours):
 *   https://developers.facebook.com/docs/threads/posts
 * - Facebook "Reels Publishing API" (3-90 seconds, 30 per 24 hours), "Page
 *   Photos" (photo formats, feed photos 4 MB; story photos 10 MB), "Facebook Stories API" (video story up to
 *   60 seconds) and "Pages API Posts":
 *   https://developers.facebook.com/docs/video-api/guides/reels-publishing
 *   https://developers.facebook.com/docs/graph-api/reference/page/photos/
 *   https://developers.facebook.com/documentation/video-api/page-stories-api
 * - TikTok Content Posting API (video: MP4/WebM/MOV, up to 4 GB, up to 10
 *   minutes through the API, caption 2,200 UTF-16 units; privacy level required
 *   and one of the creator's options; branded content cannot be private):
 *   https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide
 *   https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post
 *   https://developers.tiktok.com/docs/en/content-sharing-guidelines
 * Not documented and therefore not checked: aspect ratios (Instagram image
 * 4:5-1.91:1, video 0.01:1-10:1; they need pixel sizes the media row does not
 * store), the number of photos in a Facebook multi-photo post (the bound below
 * is a product bound), a Facebook video's size and duration, a minimum for an
 * Instagram carousel, and video limits of carousel items.
 */

const MEGABYTE = 1024 * 1024
const GIGABYTE = 1024 * MEGABYTE

/** One kind of media file a content type accepts. */
export type MediaRule = {
  kind: SocialMediaKind
  /** Accepted MIME types; `null` = not documented, anything is accepted here. */
  mimeTypes: readonly string[] | null
  maxBytes: number | null
  /** Video length bounds in seconds; `null` = not documented. */
  minDurationSeconds: number | null
  maxDurationSeconds: number | null
}

/** How a setting is edited in the composer. */
export const postOptionControls = z.enum(["switch", "select", "text", "number"])
export type PostOptionControl = z.infer<typeof postOptionControls>

/** One setting of a content type, described so the UI can render it without knowing the network. */
export type PostOptionChoice = {
  /** Translation key of the choice label, under the composer's namespace. */
  labelKey: string
  value: string
}

export type PostOptionField = {
  /** The values a `select` offers; a network may narrow them at runtime (TikTok: the creator's own options). */
  choices?: readonly PostOptionChoice[]
  control: PostOptionControl
  /** Translation key of the label, under the composer's namespace. */
  labelKey: string
  key: string
  order: number
}

export type ContentTypeRule = {
  /** `false` while the publish path of this type is not verified. */
  enabled: boolean
  /** Media files allowed, by kind; a file of another kind is rejected. */
  media: readonly MediaRule[]
  maxMedia: number
  minMedia: number
  /** Setting fields the composer shows for this type. */
  optionFields: readonly PostOptionField[]
  /** Validates and defaults the target's `options`. */
  optionsSchema: z.ZodType<Record<string, boolean | string | number>>
  text: {
    /** `null` = no documented limit. */
    maxLength: number | null
    required: boolean
  }
  /** The type can carry a link (`linkUrl`). */
  supportsLink: boolean
}

/** How a network counts the length of a text. */
export type TextUnit = "characters" | "threadsUtf8Emoji"

/**
 * Follow-up parts a network can publish after the head post (a thread chained
 * with replies, one first comment). `null` on a provider = none are offered.
 */
export type PartsRule = {
  /** The first comment can be published (counted in `maxParts`). */
  firstComment: boolean
  /** Thread parts and the first comment together, the head not counted. */
  maxParts: number
  /** Characters per part, in the provider's text unit; `null` = not documented. */
  maxPartChars: number | null
}

/** Hard cap on follow-up parts of one target, whatever the network allows. */
export const MAX_POST_PARTS = 10

export type ProviderPublishingRules = {
  /**
   * The network's API can delete a published post. Facebook: `DELETE /{id}`;
   * Threads: `DELETE /{media-id}` (needs `threads_delete`); Instagram: only
   * through Facebook Login (`DELETE /{ig-media-id}`, needs
   * `instagram_manage_contents`), see `publisherCanRemove`. Instagram Login
   * documents no delete, so its target is recorded `removalUnsupported`.
   */
  canRemove: boolean
  /** Posts a destination can publish through the API per rolling 24 hours; `null` = not documented. */
  dailyPostLimit: number | null
  /** Most unique links the text of one post may hold; `null` = not documented. */
  maxLinks: number | null
  contentTypes: Partial<Record<SocialContentType, ContentTypeRule>>
  /** Follow-up parts (text only); `null` = the network has none or it is not verified. */
  parts: PartsRule | null
  /** The unit the network counts text in. */
  textUnit: TextUnit
}

const noOptions = z.object({}).strict()

const mediaRule = (
  kind: SocialMediaKind,
  limits: Partial<Omit<MediaRule, "kind">> = {},
): MediaRule => ({
  kind,
  maxBytes: null,
  maxDurationSeconds: null,
  mimeTypes: null,
  minDurationSeconds: null,
  ...limits,
})

const instagramImage = mediaRule("image", {
  maxBytes: 8 * MEGABYTE,
  mimeTypes: ["image/jpeg"],
})
const reelVideo = mediaRule("video", {
  maxBytes: 300 * MEGABYTE,
  maxDurationSeconds: 15 * 60,
  mimeTypes: ["video/mp4", "video/quicktime"],
  minDurationSeconds: 3,
})
const instagramStoryVideo = mediaRule("video", {
  maxBytes: 100 * MEGABYTE,
  maxDurationSeconds: 60,
  mimeTypes: ["video/mp4", "video/quicktime"],
  minDurationSeconds: 3,
})
const threadsImage = mediaRule("image", {
  maxBytes: 8 * MEGABYTE,
  mimeTypes: ["image/jpeg", "image/png"],
})
const threadsVideo = mediaRule("video", {
  maxBytes: GIGABYTE,
  maxDurationSeconds: 300,
  mimeTypes: ["video/mp4", "video/quicktime"],
})
// The Reels guide lists `.mp4` as "recommended", not as the only accepted type,
// so the format is not checked.
const facebookReelVideo = mediaRule("video", {
  maxDurationSeconds: 90,
  minDurationSeconds: 3,
})

const FACEBOOK_PHOTO_MIME_TYPES: readonly string[] = [
  "image/jpeg",
  "image/bmp",
  "image/png",
  "image/gif",
  "image/tiff",
]
// The /page/photos reference: "up to 4 MB" (it also asks for PNG up to 1 MB; the
// rules hold one size per kind, so the PNG figure is not enforced here).
const facebookPhoto = mediaRule("image", {
  maxBytes: 4 * MEGABYTE,
  mimeTypes: FACEBOOK_PHOTO_MIME_TYPES,
})
// The Page Stories API: a story photo "can not exceed 10MB".
const facebookStoryPhoto = mediaRule("image", {
  maxBytes: 10 * MEGABYTE,
  mimeTypes: FACEBOOK_PHOTO_MIME_TYPES,
})
// A story video cannot exceed 60 seconds; the 3 second floor is the video spec.
const facebookStoryVideo = mediaRule("video", {
  maxDurationSeconds: 60,
  minDurationSeconds: 3,
})

const tiktokVideo = mediaRule("video", {
  maxBytes: 4 * GIGABYTE,
  // The longest video a developer can send; the creator's own limit comes from
  // creator info at publish time.
  maxDurationSeconds: 10 * 60,
  mimeTypes: ["video/mp4", "video/quicktime", "video/webm"],
})

const INSTAGRAM_MAX_CAPTION = 2200
const TIKTOK_MAX_CAPTION = 2200
// Product bound for a Facebook multi-photo post: the docs give no count.
const FACEBOOK_MULTI_PHOTO_MAX = 10
const FACEBOOK_MULTI_PHOTO_MIN = 2
const THREADS_MAX_TEXT = 500
const THREADS_MAX_LINKS = 5
const THREADS_CAROUSEL_MIN_ITEMS = 2
// Instagram documents only the maximum (20); no minimum is enforced here.
const INSTAGRAM_CAROUSEL_MIN_ITEMS = 1
const CAROUSEL_MAX_ITEMS = 20

const textOnly = (maxLength: number | null): ContentTypeRule => ({
  enabled: true,
  maxMedia: 0,
  media: [],
  minMedia: 0,
  optionFields: [],
  optionsSchema: noOptions,
  supportsLink: false,
  text: { maxLength, required: true },
})

const singleMedia = (
  media: readonly MediaRule[],
  text: ContentTypeRule["text"],
): ContentTypeRule => ({
  enabled: true,
  maxMedia: 1,
  media,
  minMedia: 1,
  optionFields: [],
  optionsSchema: noOptions,
  supportsLink: false,
  text,
})

const optionalText = (maxLength: number | null): ContentTypeRule["text"] => ({
  maxLength,
  required: false,
})

const instagramReelOptions = z
  .object({
    shareToFeed: z.boolean().default(true),
    // Documented default 0 = the first frame.
    thumbOffsetMs: z.number().int().min(0).default(0),
  })
  .strict()

const facebookVideoOptions = z
  .object({ title: z.string().default("") })
  .strict()

/** Privacy levels of `post_info.privacy_level`; the creator's own list narrows them at publish time. */
export const tiktokPrivacyLevelSchema = z.enum([
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
])
export type TiktokPrivacyLevel = z.infer<typeof tiktokPrivacyLevelSchema>

/**
 * Settings of a TikTok video. TikTok's guidelines forbid a default for the
 * privacy level and for the interaction switches, so the level is required and
 * every switch starts off. A commercial disclosure needs one of the two labels,
 * and branded content cannot be private.
 */
export const tiktokVideoOptions = z
  .object({
    allowComment: z.boolean().default(false),
    allowDuet: z.boolean().default(false),
    allowStitch: z.boolean().default(false),
    brandContent: z.boolean().default(false),
    brandOrganic: z.boolean().default(false),
    commercialContent: z.boolean().default(false),
    coverTimestampMs: z.number().int().min(0).default(0),
    isAigc: z.boolean().default(false),
    privacyLevel: tiktokPrivacyLevelSchema,
  })
  .strict()
  .superRefine((options, context) => {
    if (
      options.commercialContent &&
      !options.brandOrganic &&
      !options.brandContent
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose your brand, branded content, or both.",
        path: ["commercialContent"],
      })
    }
    if (options.brandContent && options.privacyLevel === "SELF_ONLY") {
      context.addIssue({
        code: "custom",
        message: "Branded content cannot be private.",
        path: ["privacyLevel"],
      })
    }
  })

const tiktokSwitch = (key: string, order: number): PostOptionField => ({
  control: "switch",
  key,
  labelKey: `composer.options.${key}`,
  order,
})

const titleField: PostOptionField = {
  control: "text",
  key: "title",
  labelKey: "composer.options.title",
  order: 1,
}

/** A type that takes no text (a story carries none). */
const noText: ContentTypeRule["text"] = { maxLength: 0, required: false }

const DISABLED_TYPE: ContentTypeRule = {
  enabled: false,
  maxMedia: 0,
  media: [],
  minMedia: 0,
  optionFields: [],
  optionsSchema: noOptions,
  supportsLink: false,
  text: { maxLength: null, required: false },
}

export const POST_PUBLISHING_RULES: Record<
  SocialProvider,
  ProviderPublishingRules
> = {
  facebook: {
    canRemove: true,
    // The Pages API documents no per-day post limit for feed posts.
    dailyPostLimit: null,
    maxLinks: null,
    parts: null,
    textUnit: "characters",
    contentTypes: {
      text: textOnly(null),
      link: { ...textOnly(null), supportsLink: true },
      image: singleMedia([facebookPhoto], optionalText(null)),
      carousel: {
        enabled: true,
        maxMedia: FACEBOOK_MULTI_PHOTO_MAX,
        media: [facebookPhoto],
        minMedia: FACEBOOK_MULTI_PHOTO_MIN,
        optionFields: [],
        optionsSchema: noOptions,
        supportsLink: false,
        text: optionalText(null),
      },
      // Size and length of a feed video are not documented: one file, no limit checked.
      video: {
        ...singleMedia([mediaRule("video")], optionalText(null)),
        optionFields: [titleField],
        optionsSchema: facebookVideoOptions,
      },
      reel: {
        ...singleMedia([facebookReelVideo], optionalText(null)),
        optionFields: [titleField],
        optionsSchema: facebookVideoOptions,
      },
      story: singleMedia([facebookStoryPhoto, facebookStoryVideo], noText),
    },
  },
  instagram: {
    canRemove: true,
    dailyPostLimit: 100,
    maxLinks: null,
    parts: null,
    textUnit: "characters",
    contentTypes: {
      image: singleMedia([instagramImage], optionalText(INSTAGRAM_MAX_CAPTION)),
      carousel: {
        enabled: true,
        maxMedia: CAROUSEL_MAX_ITEMS,
        media: [instagramImage, mediaRule("video")],
        minMedia: INSTAGRAM_CAROUSEL_MIN_ITEMS,
        optionFields: [],
        optionsSchema: noOptions,
        supportsLink: false,
        text: optionalText(INSTAGRAM_MAX_CAPTION),
      },
      reel: {
        ...singleMedia([reelVideo], optionalText(INSTAGRAM_MAX_CAPTION)),
        optionFields: [
          {
            control: "switch",
            key: "shareToFeed",
            labelKey: "composer.options.shareToFeed",
            order: 1,
          },
          {
            control: "number",
            key: "thumbOffsetMs",
            labelKey: "composer.options.thumbOffsetMs",
            order: 2,
          },
        ],
        optionsSchema: instagramReelOptions,
      },
      // The reference documents no caption for a story.
      story: singleMedia([instagramImage, instagramStoryVideo], noText),
    },
  },
  threads: {
    canRemove: true,
    dailyPostLimit: 250,
    // "The number of links is restricted to 5 or fewer"; unique URLs are counted.
    maxLinks: THREADS_MAX_LINKS,
    // Replies chained with `reply_to_id` (publishing reference); the first
    // comment is one more reply to the head. Posts and replies share the 250
    // per 24 hours cap: UNVERIFIED whether replies count separately.
    parts: {
      firstComment: true,
      maxParts: MAX_POST_PARTS,
      maxPartChars: THREADS_MAX_TEXT,
    },
    textUnit: "threadsUtf8Emoji",
    contentTypes: {
      text: textOnly(THREADS_MAX_TEXT),
      image: singleMedia([threadsImage], optionalText(THREADS_MAX_TEXT)),
      video: singleMedia([threadsVideo], optionalText(THREADS_MAX_TEXT)),
      carousel: {
        enabled: true,
        maxMedia: CAROUSEL_MAX_ITEMS,
        media: [threadsImage, threadsVideo],
        minMedia: THREADS_CAROUSEL_MIN_ITEMS,
        optionFields: [],
        optionsSchema: noOptions,
        supportsLink: false,
        text: optionalText(THREADS_MAX_TEXT),
      },
    },
  },
  tiktok: {
    canRemove: false,
    // TikTok documents a per-creator cap "typically around 15" shared across
    // apps, not a guaranteed number: not enforced here.
    dailyPostLimit: null,
    maxLinks: null,
    parts: null,
    textUnit: "characters",
    contentTypes: {
      // Photo posts pull the files from URLs TikTok must have verified as
      // owned by the app (`url_ownership_unverified`); the product cannot
      // guarantee that for its storage domain, so photos stay off.
      image: DISABLED_TYPE,
      video: {
        ...singleMedia([tiktokVideo], optionalText(TIKTOK_MAX_CAPTION)),
        optionFields: [
          {
            choices: tiktokPrivacyLevelSchema.options.map((value) => ({
              labelKey: `composer.tiktokPrivacy.${value}`,
              value,
            })),
            control: "select",
            key: "privacyLevel",
            labelKey: "composer.options.privacyLevel",
            order: 1,
          },
          tiktokSwitch("allowComment", 2),
          tiktokSwitch("allowDuet", 3),
          tiktokSwitch("allowStitch", 4),
          tiktokSwitch("commercialContent", 5),
          tiktokSwitch("brandOrganic", 6),
          tiktokSwitch("brandContent", 7),
          tiktokSwitch("isAigc", 8),
          {
            control: "number",
            key: "coverTimestampMs",
            labelKey: "composer.options.coverTimestampMs",
            order: 9,
          },
        ],
        optionsSchema: tiktokVideoOptions,
      },
    },
  },
}

/** The rules of one provider and content type, or why there are none. */
export const ruleFor = (
  provider: SocialProvider,
  contentType: SocialContentType,
): ContentTypeRule | undefined =>
  POST_PUBLISHING_RULES[provider].contentTypes[contentType]

/** The content types a provider offers, in the order the registry lists them. */
export const enabledContentTypes = (
  provider: SocialProvider,
): SocialContentType[] =>
  (
    Object.entries(POST_PUBLISHING_RULES[provider].contentTypes) as [
      SocialContentType,
      ContentTypeRule,
    ][]
  )
    .filter(([, rule]) => rule.enabled)
    .map(([contentType]) => contentType)

/** A media rule as plain data (mutable arrays) for an API response. */
export type MediaRuleDescription = Omit<MediaRule, "mimeTypes"> & {
  mimeTypes: string[] | null
}

export type PostOptionFieldDescription = Omit<PostOptionField, "choices"> & {
  choices?: PostOptionChoice[]
}

export type ContentTypeDescription = {
  contentType: SocialContentType
  maxMedia: number
  media: MediaRuleDescription[]
  minMedia: number
  optionFields: PostOptionFieldDescription[]
  supportsLink: boolean
  text: ContentTypeRule["text"]
}

export type ProviderRulesDescription = {
  canRemove: boolean
  parts: PartsRule | null
  textUnit: TextUnit
  contentTypes: ContentTypeDescription[]
  dailyPostLimit: number | null
  provider: SocialProvider
}

/**
 * Whether the publisher (the login a destination publishes through) can take a
 * published post down. `canRemove` is per network; Instagram differs by login:
 * only Facebook Login documents a delete.
 */
export const publisherCanRemove = (publisherKey: PublisherKey): boolean =>
  publisherKey === "instagram" ? false : publisherKey !== "tiktok"

/** The offered content types of every network as plain data (no schemas), for the API and the composer. */
export const describePublishingRules = (): ProviderRulesDescription[] =>
  (Object.keys(POST_PUBLISHING_RULES) as SocialProvider[]).map((provider) => ({
    contentTypes: enabledContentTypes(provider).flatMap((contentType) => {
      const rule = ruleFor(provider, contentType)
      return rule
        ? [
            {
              contentType,
              maxMedia: rule.maxMedia,
              media: rule.media.map((media) => ({
                ...media,
                mimeTypes: media.mimeTypes ? [...media.mimeTypes] : null,
              })),
              minMedia: rule.minMedia,
              optionFields: rule.optionFields.map((field) => ({
                ...field,
                choices: field.choices?.map((choice) => ({ ...choice })),
              })),
              supportsLink: rule.supportsLink,
              text: { ...rule.text },
            },
          ]
        : []
    }),
    canRemove: POST_PUBLISHING_RULES[provider].canRemove,
    parts: POST_PUBLISHING_RULES[provider].parts
      ? { ...POST_PUBLISHING_RULES[provider].parts }
      : null,
    textUnit: POST_PUBLISHING_RULES[provider].textUnit,
    dailyPostLimit: POST_PUBLISHING_RULES[provider].dailyPostLimit,
    provider,
  }))

/**
 * Every MIME type some network rule accepts for `kind`, sorted. A URL import
 * stores only these (plus the common image formats), never an arbitrary body.
 */
export const knownMimeTypes = (kind: SocialMediaKind): string[] => {
  const found = new Set<string>()
  for (const rules of Object.values(POST_PUBLISHING_RULES)) {
    for (const rule of Object.values(rules.contentTypes)) {
      for (const media of rule.media) {
        if (media.kind === kind) {
          for (const mimeType of media.mimeTypes ?? []) {
            found.add(mimeType)
          }
        }
      }
    }
  }
  return [...found].sort()
}
