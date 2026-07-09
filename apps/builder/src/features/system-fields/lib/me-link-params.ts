import type { MePrivacyParams } from "@chatbotx.io/business/system-field"
import { z } from "zod"

export const meLinkInputSchema = z.object({
  w: z.string().min(1),
  u: z.string().min(1),
  ib: z.string().min(1),
  id: z.string().min(1),
  hash: z.string().min(1),
})

export type MeLinkInput = z.infer<typeof meLinkInputSchema>

export const parseMeLinkInput = (
  input: Partial<Record<keyof MeLinkInput, string | undefined | null>>,
): MeLinkInput | null => {
  const result = meLinkInputSchema.safeParse(input)
  return result.success ? result.data : null
}

export const parseMeLinkSearchParams = (
  params: URLSearchParams,
): MeLinkInput | null =>
  parseMeLinkInput({
    w: params.get("w"),
    u: params.get("u"),
    ib: params.get("ib"),
    id: params.get("id"),
    hash: params.get("hash"),
  })

export const toMePrivacyParams = (input: MeLinkInput): MePrivacyParams => ({
  workspaceId: input.w,
  sourceId: input.u,
  integrationId: input.ib,
  formId: input.id,
  hash: input.hash,
})

export const toMeLinkInput = (params: MePrivacyParams): MeLinkInput => ({
  w: params.workspaceId,
  u: params.sourceId,
  ib: params.integrationId,
  id: params.formId,
  hash: params.hash ?? "",
})

export const buildMeDownloadHref = (params: MePrivacyParams): string => {
  const input = toMeLinkInput(params)
  const query = new URLSearchParams(input)
  return `/extensions/me/download?${query.toString()}`
}
