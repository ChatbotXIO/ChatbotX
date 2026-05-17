import { createEnv } from "@t3-oss/env-core"
import z from "zod"

const KEY_HEX_LENGTH = 64
const HEX_REGEX = /^[0-9a-fA-F]+$/

const hexKeySchema = z
  .string()
  .length(
    KEY_HEX_LENGTH,
    "Encryption key must be a 32-byte hex string (64 hex chars). Generate with: openssl rand -hex 32",
  )
  .regex(HEX_REGEX, "Encryption key must be hex-encoded (0-9, a-f).")

export const keys = () =>
  createEnv({
    server: {
      // Active encryption key — used for all new encryptions.
      ENCRYPTION_KEY: hexKeySchema,
      // Logical ID for the active key (default: "default").
      // Stored as `kid` in every new encrypted blob so rotation can identify
      // which key a blob was encrypted with.
      ENCRYPTION_KEY_ID: z.string().min(1).default("default"),
      // Previous key — set only during a rotation.
      // Must be the raw hex of whichever key encrypted the blobs you're migrating.
      // Remove this var once `rotate:encryption-key` has finished.
      ENCRYPTION_KEY_PREV: hexKeySchema.optional(),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })

export const env = keys()
