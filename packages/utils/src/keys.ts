import { createEnv } from "@t3-oss/env-core"
import z from "zod"

export const keys = () =>
  createEnv({
    server: {
      ENCRYPTION_KEY: z.string().min(1).default("secret"),
    },
    runtimeEnv: process.env,
  })

export const env = keys()
