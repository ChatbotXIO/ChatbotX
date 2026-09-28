import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

const macAdmissionStrategies = ["atomic", "lock"] as const
export type MacAdmissionStrategy = (typeof macAdmissionStrategies)[number]
const macAdmissionStrategySchema = z.enum(macAdmissionStrategies)

export const quotaEnforcementEnv = () => {
  const env = createEnv({
    server: {
      QUOTA_MAC_ADMISSION: macAdmissionStrategySchema.default("atomic"),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })

  return {
    ...env,
    QUOTA_MAC_ADMISSION: macAdmissionStrategySchema
      .catch("atomic")
      .parse(env.QUOTA_MAC_ADMISSION),
  }
}
