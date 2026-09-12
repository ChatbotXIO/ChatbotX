import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { createQrCodeRequest, updateQrCodeRequest } from "./action"
import { qrCodeResource } from "./resource"

const qrCodeId = zodBigintAsString()

export const publicListQrCodesRequest = publicListRequest.extend({
  keyword: z.string().optional(),
  sort: z
    .array(
      z.object({
        id: z.string(),
        desc: z.boolean(),
      }),
    )
    .optional(),
})

const qrCodePublicItem = qrCodeResource.omit({ workspaceId: true }).and(
  z.object({
    flow: z.object({ id: z.string(), name: z.string() }),
  }),
)

export const publicListQrCodesResponse = publicListResponse(qrCodePublicItem)

export const publicGetQrCodeRequest = z.object({ id: qrCodeId })
export const publicQrCodeResponse = qrCodeResource.omit({ workspaceId: true })
export const publicCreateQrCodeRequest = createQrCodeRequest
export const publicCreateQrCodeResponse = z.object({ id: qrCodeId })

export const publicUpdateQrCodeRequest = updateQrCodeRequest.extend({
  id: qrCodeId,
})

export const publicDeleteQrCodeRequest = z.object({ id: qrCodeId })
