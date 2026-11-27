import {
  type EmbeddedVideoParseFailureReason,
  parseEmbeddedVideoSource,
} from "@chatbotx.io/utils/embedded-video"
import { z } from "zod"
import { saveTemplateRequest } from "./mutation"

/** Translates a `templates.form.*` key (`useTranslations()` or a test stub). */
type Translate = (key: string) => string

export const VIDEO_PARSE_FAILURE_MESSAGE_KEYS = {
  tooLong: "templates.form.videoErrors.tooLong",
  invalidUrl: "templates.form.videoErrors.invalidUrl",
  unsupportedProvider: "templates.form.videoErrors.unsupportedProvider",
  invalidVideoId: "templates.form.videoErrors.invalidVideoId",
} as const satisfies Record<EmbeddedVideoParseFailureReason, string>

/**
 * The form's `video.source` field: a blank value means "no video" (`null`),
 * anything else must be a link or embed code the shared parser accepts. The
 * parse (pure, the same one the server runs) gives the user the reason before
 * the save; the server still re-checks. A factory because the messages are
 * translated (the form renders `error.message` as is).
 */
const createVideoFormSchema = (t: Translate) =>
  z
    .object({ source: z.string() })
    .superRefine(({ source }, ctx) => {
      if (source.trim() === "") {
        return
      }
      const parsed = parseEmbeddedVideoSource(source)
      if (!parsed.ok) {
        ctx.addIssue({
          code: "custom",
          path: ["source"],
          message: t(VIDEO_PARSE_FAILURE_MESSAGE_KEYS[parsed.reason]),
        })
      }
    })
    .transform(({ source }) => (source.trim() === "" ? null : { source }))

/** The create/edit form: the save request, with a translated `video` check. */
export const createTemplateFormSchema = (t: Translate) =>
  // `nullish` keeps the input type equal to the action's (`video` omitted,
  // null or an object), which the form resolver must match.
  saveTemplateRequest.extend({ video: createVideoFormSchema(t).nullish() })
