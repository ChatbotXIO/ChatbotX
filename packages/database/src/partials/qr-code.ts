import { z } from "zod"

export const qrStyles = z.object({ size: z.number().int().min(64).max(1024) })
export type QrStyles = z.infer<typeof qrStyles>
