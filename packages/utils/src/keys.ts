import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      FORCE_PUBLIC_HTTPS: z.stringbool().optional().default(false),
      // Channels whose webhook keeps the provider's media URL instead of
      // downloading the media (comma separated; empty = download everywhere).
      // Only channels whose provider can serve the media again belong here.
      LIVE_MEDIA_LAZY_CHANNELS: z.string().default("messenger,instagram"),
      // Same for contact profile pictures: not downloaded at contact creation,
      // fetched when the inbox or a system field first needs the picture.
      LIVE_AVATAR_LAZY_CHANNELS: z.string().default("messenger,instagram"),
      // Kill switch for re-encoding images before their first write (webhook
      // path). Shares its name and meaning with the worker's flag, which gates
      // the background re-encode job.
      STORED_IMAGE_OPTIMIZATION: z.enum(["on", "off"]).default("on"),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })
