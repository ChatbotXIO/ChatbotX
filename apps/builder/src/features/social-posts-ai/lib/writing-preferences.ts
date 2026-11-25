import { z } from "zod"

/** How many options the composer can ask for. */
export const VARIANT_COUNTS = [1, 2, 3] as const
export type VariantCount = (typeof VARIANT_COUNTS)[number]

/** Most characters of call-to-action wording (the API's limit). */
export const MAX_CTA_CHARS = 80

const storedPreferences = z.object({
  callToAction: z.boolean().optional(),
  callToActionText: z.string().max(MAX_CTA_CHARS).optional(),
  emoji: z.boolean().optional(),
  hashtags: z.boolean().optional(),
  perNetwork: z.boolean().optional(),
  variants: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
})

/** What the person chose last time in this workspace; every field is optional. */
export type WritingPreferences = z.infer<typeof storedPreferences>

export const writingPreferencesKey = (workspaceId: string): string =>
  `chatbotx:post-ai:${workspaceId}`

/** Stored JSON back into preferences; anything unreadable is "nothing chosen yet". */
export const parseWritingPreferences = (
  raw: string | null,
): WritingPreferences => {
  if (!raw) {
    return {}
  }
  try {
    const parsed = storedPreferences.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

export const readWritingPreferences = (
  workspaceId: string,
): WritingPreferences => {
  try {
    return parseWritingPreferences(
      window.localStorage.getItem(writingPreferencesKey(workspaceId)),
    )
  } catch {
    return {}
  }
}

export const saveWritingPreferences = (
  workspaceId: string,
  preferences: WritingPreferences,
): void => {
  try {
    window.localStorage.setItem(
      writingPreferencesKey(workspaceId),
      JSON.stringify(preferences),
    )
  } catch {
    // Storage can be blocked or full: the choices simply are not remembered.
  }
}
