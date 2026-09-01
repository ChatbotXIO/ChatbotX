import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { QR_CODE_SIZE } from "../constants"

const QR_CODE_NAME_REGEX = /^[a-zA-Z0-9]+$/

export const createQrCodeRequest = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .refine((value) => QR_CODE_NAME_REGEX.test(value)),
  flowId: zodBigintAsString(),
  size: z.coerce
    .number()
    .int()
    .min(QR_CODE_SIZE.MIN)
    .max(QR_CODE_SIZE.MAX)
    .default(QR_CODE_SIZE.DEFAULT),
})
export type CreateQrCodeRequest = z.infer<typeof createQrCodeRequest>

export const updateQrCodeRequest = createQrCodeRequest.partial()
export type UpdateQrCodeRequest = z.infer<typeof updateQrCodeRequest>
