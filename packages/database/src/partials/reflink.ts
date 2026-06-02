import { z } from "zod"

export const reflinkTypes = z.enum(["refLink", "qrCode"])
export type ReflinkType = z.infer<typeof reflinkTypes>
