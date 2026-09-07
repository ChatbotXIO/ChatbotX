import { aiEditImageQuality } from "@chatbotx.io/flow-config"
import { z } from "zod"

export const editImageInputSchema = z.object({
  imageUrl: z
    .string()
    .trim()
    .url("Input image URL must be a valid public URL")
    .refine(
      (val) => val.startsWith("http://") || val.startsWith("https://"),
      "Input image URL must use HTTP or HTTPS",
    ),
  prompt: z.string().trim().min(1, "Prompt is required"),
  provider: z.enum(["openai", "gemini"]),
  model: z.string().trim().min(1),
  size: z.string().trim().min(1),
  quality: aiEditImageQuality,
})

export type EditImageInput = z.infer<typeof editImageInputSchema>
