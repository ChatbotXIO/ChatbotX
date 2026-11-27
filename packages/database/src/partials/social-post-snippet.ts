import { z } from "zod"

/** What a reusable post snippet is for: appended to a post, or inserted into its text. */
export const socialPostSnippetKinds = z.enum(["signature", "hashtags", "text"])
export type SocialPostSnippetKind = z.infer<typeof socialPostSnippetKinds>
