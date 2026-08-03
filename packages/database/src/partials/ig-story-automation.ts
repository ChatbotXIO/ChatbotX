import { z } from "zod"

export const igStoryAutomationTypes = z.enum(["instagram", "instagramFacebook"])
export type IgStoryAutomationType = z.infer<typeof igStoryAutomationTypes>

export const igStoryTargetSchema = z.object({
  type: z.enum(["all", "storyIds"]),
  value: z.array(z.string()),
})
export type IgStoryTarget = z.infer<typeof igStoryTargetSchema>
