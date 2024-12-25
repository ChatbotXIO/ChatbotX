import { z } from "zod"

// export const updateChatbotSchema = z.object({
//   id: z.string().cuid2(),
//   defaultReply: z.string().trim(),
//   targetCountry: z.string().trim(),
//   defaultLanguage: z.string().trim(),
//   accountTimezone: z.string().trim(),
//   brandColor: z.string().trim(),
//   developmentMode: z.boolean(),
// });

export const updateChatbotSchema = z.object({
  id: z.string().min(1, { message: "ID không được để trống" }),
  defaultReply: z.string().min(1, { message: "Default reply không được để trống" }),
  targetCountry: z.string().min(1, { message: "Target country không được để trống" }),
  defaultLanguage: z.string().min(1, { message: "Default language không được để trống" }),
  accountTimezone: z.string().min(1, { message: "Account timezone không được để trống" }),
  brandColor: z.string().min(1, { message: "Brand color không được để trống" }),
  developmentMode: z.boolean(),
});

export type UpdateChatbotSchema = z.infer<typeof updateChatbotSchema>

export const updateChatbotBindSchema: [chatbotId: z.ZodString] = [
  z.string().cuid2(),
]
export type UpdateChatbotBindSchema = [chatbotId: string]
