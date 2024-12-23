import { z } from "zod"

export const updateChatbotSchema = z.object({
  id: z.string().cuid2(),
  defaultReply: z.string().trim(),
  targetCountry: z.string().trim(),
  defaultLanguage: z.string().trim(),
  accountTimezone: z.string().trim(),
  brandColor: z.string().trim(),
  developmentMode: z.boolean(),
});
