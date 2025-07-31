import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"
import { getRuntimeVariable } from "./getRuntimeVariable"

const togleeEnv = {
  client: {
    NEXT_PUBLIC_TOLGEE_API_URL: z.string().url(),
    NEXT_PUBLIC_TOLGEE_API_KEY: z.string().min(1),
  },
  runtimeEnv: {
    NEXT_PUBLIC_TOLGEE_API_URL: getRuntimeVariable(
      "NEXT_PUBLIC_TOLGEE_API_URL",
    ),
    NEXT_PUBLIC_TOLGEE_API_KEY: getRuntimeVariable(
      "NEXT_PUBLIC_TOLGEE_API_KEY",
    ),
  },
}

const smptEnv = {
  server: {
    SMTP_SERVER: z.string().min(1).optional(),
  },
  client: {
    NEXT_PUBLIC_SMTP_FROM: z.string().min(1).optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SMTP_FROM: getRuntimeVariable("NEXT_PUBLIC_SMTP_FROM"),
  },
}

export const env = createEnv({
  server: {
    ...smptEnv.server,
  },
  client: {
    ...smptEnv.client,
    ...togleeEnv.client,
  },
  experimental__runtimeEnv: {
    ...smptEnv.runtimeEnv,
    ...togleeEnv.runtimeEnv,
  },
})
