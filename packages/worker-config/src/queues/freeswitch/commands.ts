import { z } from "zod"

// FreeSWITCH mod_sofia gateway/profile names and channel uuids the ESL API
// allow-list accepts. Never build a command from an unvalidated string —
// every field here is checked BEFORE `renderFreeswitchApiCommand` touches it
// (the ESL equivalent of SQL-injection hardening).
const sofiaProfileSchema = z.string().regex(/^[a-z]+$/, "invalid sofia profile")
const sipGatewaySchema = z.string().regex(/^wa-\d+$/, "invalid gateway name")
const freeswitchUuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "invalid FreeSWITCH channel uuid",
  )
const hangupCauseSchema = z
  .string()
  .regex(/^[A-Z_]{1,64}$/, "invalid hangup cause")
  .optional()

/**
 * Allow-listed FreeSWITCH ESL `api` commands. This is the ONLY
 * place a command string is built (`renderFreeswitchApiCommand`) — callers
 * never concatenate strings themselves.
 */
export const freeswitchApiCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sofiaProfileRescan"),
    profile: sofiaProfileSchema,
  }),
  z.object({
    kind: z.literal("sofiaGatewayStart"),
    profile: sofiaProfileSchema,
    gateway: sipGatewaySchema,
  }),
  z.object({
    kind: z.literal("sofiaGatewayKill"),
    profile: sofiaProfileSchema,
    gateway: sipGatewaySchema,
  }),
  z.object({
    kind: z.literal("sofiaGatewayStatus"),
    gateway: sipGatewaySchema,
  }),
  z.object({
    kind: z.literal("uuidKill"),
    uuid: freeswitchUuidSchema,
    cause: hangupCauseSchema,
  }),
])
export type FreeswitchApiCommand = z.infer<typeof freeswitchApiCommandSchema>

/**
 * Table-driven command rendering (no if/else chain): one pure
 * function per `kind`, the only place that turns a validated command into
 * the literal string sent over ESL `api`.
 */
const FREESWITCH_API_COMMAND_RENDERERS: {
  [K in FreeswitchApiCommand["kind"]]: (
    command: Extract<FreeswitchApiCommand, { kind: K }>,
  ) => string
} = {
  sofiaProfileRescan: (command) => `sofia profile ${command.profile} rescan`,
  sofiaGatewayStart: (command) =>
    `sofia profile ${command.profile} startgw ${command.gateway}`,
  sofiaGatewayKill: (command) =>
    `sofia profile ${command.profile} killgw ${command.gateway}`,
  sofiaGatewayStatus: (command) => `sofia status gateway ${command.gateway}`,
  uuidKill: (command) =>
    command.cause
      ? `uuid_kill ${command.uuid} ${command.cause}`
      : `uuid_kill ${command.uuid}`,
}

/** Renders a validated {@link FreeswitchApiCommand} into its literal ESL `api` string. */
export const renderFreeswitchApiCommand = (
  command: FreeswitchApiCommand,
): string => {
  const renderer = FREESWITCH_API_COMMAND_RENDERERS[command.kind] as (
    c: FreeswitchApiCommand,
  ) => string
  return renderer(command)
}
