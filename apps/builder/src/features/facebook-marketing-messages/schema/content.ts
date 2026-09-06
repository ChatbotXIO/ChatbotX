import { uploadModes } from "@chatbotx.io/database/partials"
import { BUTTON_LABEL_MAX } from "@chatbotx.io/flow-config"
import {
  createId,
  zodBigintAsString,
  zodUrlWithVariables,
} from "@chatbotx.io/utils"
import { z } from "zod"

/** Meta: quick replies allow "Up to 13 buttons" — NOT the flow package's 10. */
export const MM_MAX_QUICK_REPLIES = 13
export const MM_TEXT_MAX = 640
export const MM_ELEMENT_TITLE_MAX = 80
/** Marketing Messages allows 250 here, unlike the usual generic-template 80. */
export const MM_ELEMENT_SUBTITLE_MAX = 250
export const MM_MAX_BUTTONS = 3
export const MM_MAX_ELEMENTS = 10
export const MM_QUICK_REPLY_TITLE_MAX = 20

// ── Actions ─────────────────────────────────────────────────────────────────
const mmOpenWebsiteAction = z.object({
  actionType: z.literal("openWebsite"),
  url: zodUrlWithVariables(),
  // Maps to Messenger's webview_height_ratio.
  browserSize: z.literal([40, 70, 100]),
})
const mmStartExternalFlowAction = z.object({
  actionType: z.literal("startExternalFlow"),
  flowId: zodBigintAsString(),
})
const mmStartExternalNodeAction = z.object({
  actionType: z.literal("startExternalNode"),
  flowId: zodBigintAsString(),
  nodeId: zodBigintAsString(),
})

/**
 * Quick replies are postback-only: Meta defines no URL quick reply, so
 * `openWebsite` is deliberately absent here.
 */
const mmPostbackAction = z.discriminatedUnion("actionType", [
  mmStartExternalFlowAction,
  mmStartExternalNodeAction,
])
export type MmPostbackAction = z.infer<typeof mmPostbackAction>

// ── Buttons ─────────────────────────────────────────────────────────────────
/**
 * `openWebsite` -> `{ type: "web_url" }`; both postback variants ->
 * `{ type: "postback" }`. There is no `performAction` and no
 * `startAnotherNode`: without a flow canvas, "perform actions" is expressed by
 * pointing `startExternalNode` at an existing Perform Actions node.
 */
export const mmButtonSchema = z
  .object({
    id: zodBigintAsString(),
    title: z.string().trim().min(1).max(BUTTON_LABEL_MAX),
  })
  .and(
    z.discriminatedUnion("actionType", [
      mmOpenWebsiteAction,
      mmStartExternalFlowAction,
      mmStartExternalNodeAction,
    ]),
  )
export type MmButton = z.infer<typeof mmButtonSchema>

// ── Quick replies ───────────────────────────────────────────────────────────
/**
 * Only a text quick reply needs an action. `user_phone_number` and `user_email`
 * send the contact's own value back when tapped — Meta makes their payload
 * optional — so the editor hides the action picker for them and the schema must
 * not demand one. Kept `.optional()` rather than dropped, so campaigns saved
 * while it was required still round-trip.
 */
export const mmQuickReplySchema = z.discriminatedUnion("contentType", [
  z.object({
    contentType: z.literal("text"),
    id: zodBigintAsString(),
    title: z.string().trim().min(1).max(MM_QUICK_REPLY_TITLE_MAX),
    action: mmPostbackAction,
  }),
  z.object({
    contentType: z.literal("user_phone_number"),
    id: zodBigintAsString(),
    action: mmPostbackAction.optional(),
  }),
  z.object({
    contentType: z.literal("user_email"),
    id: zodBigintAsString(),
    action: mmPostbackAction.optional(),
  }),
])
export type MmQuickReply = z.infer<typeof mmQuickReplySchema>

// ── Media ───────────────────────────────────────────────────────────────────
/**
 * Shape required by `MediaLibraryOrInsertLink`, which binds to
 * `<parentName>.mode`, `.url` and `.id`.
 *
 * `attachmentId` is filled at save time: Meta's media template requires an
 * `attachment_id` or a Facebook-hosted URL, and a media-library S3 URL is
 * neither.
 */
export const mmMediaRefSchema = z.object({
  id: zodBigintAsString(),
  mode: uploadModes,
  url: zodUrlWithVariables(),
  attachmentId: z.string().optional(),
})
export type MmMediaRef = z.infer<typeof mmMediaRefSchema>

// ── Templates ───────────────────────────────────────────────────────────────
const quickReplies = z.array(mmQuickReplySchema).max(MM_MAX_QUICK_REPLIES)
const buttons = z.array(mmButtonSchema).max(MM_MAX_BUTTONS)

/**
 * The generic element's image is optional, but `MediaLibraryOrInsertLink` binds
 * to a mounted `{ id, mode, url }` object — so the editor always seeds one with
 * an empty `url`. An empty string therefore means "no image" and must validate;
 * a non-empty value still has to be a real URL (or carry a `{{variable}}`).
 *
 * This is deliberately NOT folded into `mmMediaRefSchema`: the media template's
 * `media` is required, and must keep rejecting an empty URL.
 */
const mmOptionalMediaRefSchema = mmMediaRefSchema.extend({
  url: zodUrlWithVariables().or(z.literal("")),
})

export const mmGenericElementSchema = z.object({
  id: zodBigintAsString(),
  title: z.string().trim().min(1).max(MM_ELEMENT_TITLE_MAX),
  subtitle: z.string().trim().max(MM_ELEMENT_SUBTITLE_MAX).optional(),
  image: mmOptionalMediaRefSchema.optional(),
  buttons,
})
export type MmGenericElement = z.infer<typeof mmGenericElementSchema>

export const mmContentSchema = z.discriminatedUnion("templateType", [
  z.object({
    templateType: z.literal("text"),
    text: z.string().trim().min(1).max(MM_TEXT_MAX),
    quickReplies,
  }),
  z.object({
    templateType: z.literal("button"),
    text: z.string().trim().min(1).max(MM_TEXT_MAX),
    buttons: z.array(mmButtonSchema).min(1).max(MM_MAX_BUTTONS),
    quickReplies,
  }),
  z.object({
    templateType: z.literal("media"),
    mediaType: z.enum(["image", "video"]),
    media: mmMediaRefSchema,
    buttons,
    quickReplies,
  }),
  z.object({
    templateType: z.literal("generic"),
    // Maps to the generic payload's optional top-level `text` greeting.
    greeting: z.string().trim().max(MM_TEXT_MAX).optional(),
    elements: z.array(mmGenericElementSchema).min(1).max(MM_MAX_ELEMENTS),
    quickReplies,
  }),
])
export type MmContent = z.infer<typeof mmContentSchema>
export type MmTemplateType = MmContent["templateType"]

// ── Defaults (used by the form editors) ─────────────────────────────────────
export const mmMediaRefDefaultFn = (): MmMediaRef => ({
  id: createId(),
  mode: uploadModes.enum.file,
  url: "",
})

export const mmButtonDefaultFn = (): MmButton => ({
  id: createId(),
  title: "",
  actionType: "openWebsite",
  url: "",
  browserSize: 100,
})

/** Shared with the editor, which re-seeds it when a reply switches back to text. */
export const mmQuickReplyActionDefaultFn = (): MmPostbackAction => ({
  actionType: "startExternalFlow",
  flowId: "",
})

export const mmQuickReplyDefaultFn = (): MmQuickReply => ({
  id: createId(),
  contentType: "text",
  title: "",
  action: mmQuickReplyActionDefaultFn(),
})

export const mmGenericElementDefaultFn = (): MmGenericElement => ({
  id: createId(),
  title: "",
  subtitle: "",
  image: mmMediaRefDefaultFn(),
  buttons: [],
})

export const mmContentDefaultFn = (templateType: MmTemplateType): MmContent => {
  switch (templateType) {
    case "text":
      return { templateType: "text", text: "", quickReplies: [] }
    case "button":
      return {
        templateType: "button",
        text: "",
        buttons: [mmButtonDefaultFn()],
        quickReplies: [],
      }
    case "media":
      return {
        templateType: "media",
        mediaType: "image",
        media: mmMediaRefDefaultFn(),
        buttons: [],
        quickReplies: [],
      }
    default:
      return {
        templateType: "generic",
        greeting: "",
        elements: [mmGenericElementDefaultFn()],
        quickReplies: [],
      }
  }
}
