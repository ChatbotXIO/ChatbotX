import { z } from "zod"
import { loadEnvConfig } from "@next/env"

const projectDir = process.cwd()
loadEnvConfig(projectDir)

const authSchema = z.object({
  AUTH_SECRET: z
    .string()
    .default("bRdiWZreJT/1yyFXU019L02gJiC02tP+8e36fGclZnI="),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_FACEBOOK_ID: z.string().optional(),
  AUTH_FACEBOOK_SECRET: z.string().optional(),
})

const emailSchema = z.object({
  EMAIL_SERVER: z.string(),
  EMAIL_FROM: z.string().email(),
})

const websocketSchema = z.object({
  PARTYSOCKET_API_KEY: z.string().default("EE568FEC5556656325DE164BF4AD8"),
})

const databaseSchema = z.object({
  DATABASE_URL: z.string().url(),
})

const workspaceSchema = z.object({
  WORKSPACE_ID: z.string().cuid2().default("b7p91mne1bjgd5buq8x0w51c"),
})

const serversSchema = z.union([
  authSchema,
  emailSchema,
  websocketSchema,
  databaseSchema,
  workspaceSchema,
])

const env = serversSchema.parse(process.env)

export { env }
