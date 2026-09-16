import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const publicIdParam = (resource: string, lookup: string) =>
  z.object({
    id: zodBigintAsString().describe(
      `${resource} id (numeric string). Get it from \`${lookup}\`.`,
    ),
  })

export const describeId = (label: string, lookup: string) =>
  zodBigintAsString().describe(
    `${label} id (numeric string). Get it from \`${lookup}\`.`,
  )
