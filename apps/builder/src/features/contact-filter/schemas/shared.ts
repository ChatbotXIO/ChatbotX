import { z } from "zod"

export const sampleStringSchema = z.string().trim().min(1).max(255)
