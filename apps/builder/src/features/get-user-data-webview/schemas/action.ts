import { z } from "zod"

// Lives outside the server-action file on purpose: Next.js only allows async
// function exports from a "use server" module (mirrors booking-webview's
// schemas/action.ts).
export const submitDateTimeRequestSchema = z.object({
  token: z.string().min(1),
  selectedValue: z.iso.datetime(),
})

export type SubmitDateTimeInput = z.infer<typeof submitDateTimeRequestSchema>
