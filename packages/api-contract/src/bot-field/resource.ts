import { customFieldTypes } from "@chatbotx.io/database/partials"
import { botFieldModel, createSelectSchema } from "@chatbotx.io/database/schema"
import { zodFieldName } from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const botFieldResource = createSelectSchema(botFieldModel, {
  id: z.string(),
  workspaceId: z.string(),
})

export const publicBotFieldResource = botFieldResource.pick({
  id: true,
  name: true,
  type: true,
  value: true,
})
export type PublicBotFieldResource = z.infer<typeof publicBotFieldResource>

export const publicListBotFieldsResponse = z.object({
  data: z.array(publicBotFieldResource),
})
export type PublicListBotFieldsResponse = z.infer<
  typeof publicListBotFieldsResponse
>

export const createBotFieldInput = z.object({
  name: zodFieldName(),
  type: customFieldTypes,
  value: z.string().trim().max(1000).nullable(),
  description: z.string().max(1000).nullable(),
  folderId: zodBigintAsString().nullish(),
})
export type CreateBotFieldInput = z.infer<typeof createBotFieldInput>

export const getBotFieldInput = z.object({
  idOrName: z.string().max(255),
})
export type GetBotFieldInput = z.infer<typeof getBotFieldInput>

export const setBotFieldInput = z.object({
  idOrName: z.string().max(255),
  value: z.string().max(255),
})
export type SetBotFieldInput = z.infer<typeof setBotFieldInput>

export const setBotFieldsInput = z.object({
  fields: z.array(
    z.object({ key: z.string().max(255), value: z.string().max(255) }),
  ),
})
export type SetBotFieldsInput = z.infer<typeof setBotFieldsInput>

export const bulkUpdateBotFieldsInput = z.object({
  fields: z.array(
    z.union([
      z.object({
        id: z.coerce.number().int().positive(),
        value: z.union([z.string(), z.number()]).transform(String),
      }),
      z.object({
        name: z.string().max(255),
        value: z.union([z.string(), z.number()]).transform(String),
      }),
    ]),
  ),
})
export type BulkUpdateBotFieldsInput = z.infer<typeof bulkUpdateBotFieldsInput>

export const deleteBotFieldInput = z.object({
  idOrName: z.string().max(255),
})
export type DeleteBotFieldInput = z.infer<typeof deleteBotFieldInput>
