import { z } from "zod"

/**
 * Where an outgoing send was started, carried on chat/integration/heavy jobs
 * as `sendFrom`:
 * - `inbox` — a workspace member acting in the builder's Inbox (composer,
 *   a flow/template/booking link/call-permission request sent from a
 *   conversation, Resend). Its message is kept, with the error, when the send
 *   fails for good.
 * - `api` — the Public API, CLI or MCP (member or workspace token) and
 *   system-made sends such as order notifications. Treated like `inbox` for
 *   channel policy (human-agent tag, quick replies), but a failed message is
 *   removed and its error goes to the Error Log.
 *
 * Absent means an automation (flow, trigger, AI agent, broadcast, …).
 */
export const sendFromSchema = z.enum(["inbox", "api"])
export type SendFrom = z.infer<typeof sendFromSchema>

/**
 * Whether a send was started by a person or an API client rather than an
 * automation. Every channel-policy check that used to read
 * `sendFrom === "inbox"` reads this, so `api` keeps the behaviour it had when
 * it was sent as `inbox`.
 */
export const isManualSend = (sendFrom: SendFrom | undefined): boolean =>
  sendFrom !== undefined
