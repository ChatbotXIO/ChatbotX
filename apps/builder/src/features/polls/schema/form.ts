import { z } from "zod"
import {
  POLL_CANDIDATE_DESCRIPTION_MAX,
  POLL_CANDIDATE_NAME_MAX,
  POLL_NAME_MAX,
} from "./action"

export const POLL_MIN_CANDIDATES = 2
export const POLL_MAX_CANDIDATES = 10

/** Shape `DirectUploadOrInsertLink` reads and writes (`<parent>.url`). */
const imageFieldSchema = z.object({
  url: z.string(),
  mode: z.enum(["file", "url"]).optional(),
})

export const pollCandidateFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(POLL_CANDIDATE_NAME_MAX),
  description: z.string().trim().max(POLL_CANDIDATE_DESCRIPTION_MAX),
  image: imageFieldSchema,
})

/** Translates a `pollManager.form.*` key (`useTranslations()` or a test stub). */
type Translate = (key: string) => string

/**
 * Client-side form schema. Mirrors the public request limits
 * (`pollFormRequest`) but keeps images as `{ url, mode }` objects for the
 * upload widget; `toPollRequest` flattens it for the API. A factory because
 * the refine messages are translated (the form renders `error.message` as is).
 */
export const createPollFormSchema = (t: Translate) =>
  z
    .object({
      name: z.string().trim().min(1).max(POLL_NAME_MAX),
      image: imageFieldSchema.refine((value) => value.url.trim().length > 0, {
        message: t("pollManager.form.imageRequired"),
      }),
      startsAt: z.string().min(1),
      endsAt: z.string().min(1),
      afterVoteFlowId: z.string().nullable(),
      candidates: z
        .array(pollCandidateFormSchema)
        .min(POLL_MIN_CANDIDATES)
        .max(POLL_MAX_CANDIDATES),
    })
    .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
      path: ["endsAt"],
      message: t("pollManager.form.dateRangeInvalid"),
    })

export const pollFormSchema = createPollFormSchema((key) => key)

export type PollFormValues = z.infer<typeof pollFormSchema>

export function toPollRequest(values: PollFormValues) {
  return {
    name: values.name,
    imageUrl: values.image.url,
    startsAt: new Date(values.startsAt).toISOString(),
    endsAt: new Date(values.endsAt).toISOString(),
    afterVoteFlowId: values.afterVoteFlowId,
    candidates: values.candidates.map((candidate) => ({
      ...(candidate.id ? { id: candidate.id } : {}),
      name: candidate.name,
      description: candidate.description || null,
      imageUrl: candidate.image.url || null,
    })),
  }
}
