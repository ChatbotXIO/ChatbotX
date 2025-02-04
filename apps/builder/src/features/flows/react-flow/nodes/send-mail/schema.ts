import { codeBlockSchema } from "@/features/flows/react-flow/blocks/code/schema"
import { headingBlockSchema } from "@/features/flows/react-flow/blocks/heading/schema"
import { imageBlockSchema } from "@/features/flows/react-flow/blocks/image/schema"
import { inputBlockSchema } from "@/features/flows/react-flow/blocks/input/schema"
import { lineBlockSchema } from "@/features/flows/react-flow/blocks/line/schema"
import { selectBlockSchema } from "@/features/flows/react-flow/blocks/select/schema"
import { singleButtonBlockSchema } from "@/features/flows/react-flow/blocks/single-button/schema"
import { spacingBlockSchema } from "@/features/flows/react-flow/blocks/spacing/schema"
import { textBlockSchema } from "@/features/flows/react-flow/blocks/text/schema"
import { z } from "zod"

export const sendMailNodeSchema = z.object({
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
      inputBlockSchema,
      selectBlockSchema,
    ]),
  ),
})

export type SendMailNodeSchema = z.infer<typeof sendMailNodeSchema>
