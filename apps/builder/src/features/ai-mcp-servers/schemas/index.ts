import {
  type AIMCPServerModel,
  AIMcpServerAuthType,
} from "@aha.chat/database/types"
import { z } from "zod"

export type AIMcpServerCollection = {
  data: AIMCPServerModel[]
}

export const listAIMcpServersRequest = z.object({
  chatbotId: z.string(),
})
export type ListAIMcpServersRequest = z.infer<typeof listAIMcpServersRequest>

const baseAIMcpServerRequest = z.object({
  url: z.url(),
  auth: z.discriminatedUnion("type", [
    z.object({
      type: z.literal(AIMcpServerAuthType.none),
    }),
    z.object({
      type: z.literal(AIMcpServerAuthType.token),
      token: z.string().trim().min(1),
    }),
    z.object({
      type: z.literal(AIMcpServerAuthType.header),
      headers: z.array(
        z.object({
          header: z.string().trim().min(1),
          value: z.string().trim().min(1),
        }),
      ),
    }),
  ]),
})
export type BaseAIMcpServerRequest = z.infer<typeof baseAIMcpServerRequest>

export const createAIMcpServerRequest = baseAIMcpServerRequest.extend({
  name: z.string().trim().min(1),
  availableTools: z.record(z.string(), z.any()),
  selectedTools: z.array(z.string()),
})
export type CreateAIMcpServerRequest = z.infer<typeof createAIMcpServerRequest>

export const validateAIMcpServerRequest = baseAIMcpServerRequest
export type ValidateAIMcpServerRequest = z.infer<
  typeof validateAIMcpServerRequest
>
