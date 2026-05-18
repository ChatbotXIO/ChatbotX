import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      NEXT_PUBLIC_EDITION: z
        .enum(["community", "enterprise", "cloud"])
        .default("community"),
    },
    runtimeEnv: process.env,
  })

export const isCommunity = () => keys().NEXT_PUBLIC_EDITION === "community"
export const isEnterprise = () => keys().NEXT_PUBLIC_EDITION === "enterprise"
