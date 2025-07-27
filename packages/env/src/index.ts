import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"
import { getRuntimeVariable } from "./getRuntimeVariable"

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
  },
  experimental__runtimeEnv: {
    ...smptEnv.runtimeEnv,
  },
})
