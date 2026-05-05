import { z } from "zod"

export const editImageInputSchema = z.object({
  imageUrl: z
    .string()
    .trim()
    .min(1, "Input image URL is required")
    .refine(
      (val) => val.startsWith("http") || val.startsWith("data:image"),
      "Invalid image URL or data URI",
    ),
  prompt: z.string().trim().min(1, "Prompt is required"),
  provider: z.enum(["openai", "gemini"]),
  model: z.string().trim().min(1),
  size: z.string().trim().min(1),
  quality: z.string().trim().min(1),
})

export type EditImageInput = z.infer<typeof editImageInputSchema>
