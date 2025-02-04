import { codeBlockSchema } from "@/features/flows/react-flow/blocks/code/schema"
import { headingBlockSchema } from "@/features/flows/react-flow/blocks/heading/schema"
import { imageBlockSchema } from "@/features/flows/react-flow/blocks/image/schema"
import { lineBlockSchema } from "@/features/flows/react-flow/blocks/line/schema"
import { singleButtonBlockSchema } from "@/features/flows/react-flow/blocks/single-button/schema"
import { spacingBlockSchema } from "@/features/flows/react-flow/blocks/spacing/schema"
import { textBlockSchema } from "@/features/flows/react-flow/blocks/text/schema"
import { z } from "zod"

export const landingPageNodeSchema = z.object({
  id: z.string(),
  blocks: z.array(
    z.union([
      headingBlockSchema,
      spacingBlockSchema,
      textBlockSchema,
      singleButtonBlockSchema,
      lineBlockSchema,
      imageBlockSchema,
      codeBlockSchema,
    ]),
  ),
})

export type LandingPageNodeSchema = z.infer<typeof landingPageNodeSchema>
