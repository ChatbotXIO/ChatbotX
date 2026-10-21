import {
  type MmButton,
  type MmContent,
  type MmGenericElement,
  type MmMediaRef,
  type MmPostbackAction,
  type MmQuickReply,
  type MmTemplateType,
  uploadModes,
} from "@chatbotx.io/database/partials"
import { createId } from "@chatbotx.io/utils"

export {
  MM_ELEMENT_SUBTITLE_MAX,
  MM_ELEMENT_TITLE_MAX,
  MM_MAX_BUTTONS,
  MM_MAX_ELEMENTS,
  MM_MAX_QUICK_REPLIES,
  MM_QUICK_REPLY_TITLE_MAX,
  MM_TEXT_MAX,
  type MmButton,
  type MmContent,
  type MmGenericElement,
  type MmMediaRef,
  type MmPostbackAction,
  type MmQuickReply,
  type MmTemplateType,
  mmButtonSchema,
  mmContentSchema,
  mmGenericElementSchema,
  mmMediaRefSchema,
  mmQuickReplySchema,
} from "@chatbotx.io/database/partials"

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
