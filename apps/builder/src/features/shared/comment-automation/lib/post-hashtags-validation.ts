import type { z } from "zod"

/**
 * Form-level check that a `hashtags` post target lists at least one hashtag.
 * The service rejects an empty list too; this only shows the error on the
 * field (translated) before a request is sent. Applied at the form's resolver
 * rather than inside the shared request schema, so the schema stays plain for
 * `.partial()` and the public API.
 */
export function refinePostHashtags(message: string) {
  return (
    data: { post?: { type: string; value: string[] } },
    ctx: z.RefinementCtx,
  ) => {
    if (data.post?.type === "hashtags" && data.post.value.length === 0) {
      ctx.addIssue({ code: "custom", path: ["post", "value"], message })
    }
  }
}
