import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

/**
 * In-app WhatsApp calling (beta) runs over a self-hosted LiveKit deployment
 * bridging Meta's SIP mode. All keys are optional — when unset, the feature
 * is simply unavailable and the UI hides its entry points.
 *
 * S3_* mirrors `packages/filesystem/src/keys.ts` — the LiveKit egress
 * uploads call recordings into the same bucket the app serves files from.
 */
export const keys = () =>
  createEnv({
    server: {
      LIVEKIT_URL: z.url().optional(),
      LIVEKIT_API_KEY: z.string().min(1).optional(),
      LIVEKIT_API_SECRET: z.string().min(1).optional(),
      /** SIP host presented to Meta in the phone number's calling settings. */
      LIVEKIT_SIP_DOMAIN: z.string().min(1).optional(),
      /** LiveKit SIP outbound trunk id — required for business-initiated calls. */
      LIVEKIT_SIP_OUTBOUND_TRUNK_ID: z.string().min(1).optional(),
      S3_ENDPOINT: z.url().optional(),
      S3_ACCESS_KEY_ID: z.string().min(1).optional(),
      S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
      S3_REGION: z.string().min(1).optional(),
      S3_BUCKET: z.string().min(1).optional(),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })
