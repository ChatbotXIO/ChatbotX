import { z } from "zod"

export const igStoryAutomationTypes = z.enum(["instagram", "instagramFacebook"])
export type IgStoryAutomationType = z.infer<typeof igStoryAutomationTypes>

export const igStoryTargetSchema = z.object({
  type: z
    .enum(["all", "storyIds"])
    .describe(
      "Which stories to watch: `all` or only the ones in `value` (`storyIds`).",
    ),
  value: z
    .array(z.string())
    .describe(
      "Instagram story ids to watch. Used only when `type` is `storyIds`; get them from `igStories.listStories`. Send `[]` for `all`.",
    ),
})
export type IgStoryTarget = z.infer<typeof igStoryTargetSchema>
