import { z } from "zod"

export const lineWebhookStatusResource = z.object({
  url: z
    .string()
    .describe("Webhook URL registered with LINE for this channel."),
  previousWebhookUrl: z
    .string()
    .nullable()
    .describe(
      "A different webhook URL that was set on the LINE channel and has been overwritten; null when none.",
    ),
  active: z
    .boolean()
    .describe(
      'Whether LINE reports the webhook as enabled (the console\'s "Use webhook" toggle). When false, LINE sends no events until it is switched on in the LINE Developers console.',
    ),
  testOk: z
    .boolean()
    .describe("Whether LINE's webhook test reached this app successfully."),
  testReason: z
    .string()
    .optional()
    .describe("LINE's reason when the webhook test failed."),
})

/** Never includes `auth` or the channel secret. */
export const lineChannelResource = z.object({
  id: z.string().describe("LINE channel (integration) id."),
  inboxId: z.string().describe("Inbox this channel feeds. See `inboxes.list`."),
  channelId: z.string().describe("LINE Channel ID."),
  name: z.string().describe("LINE Official Account display name."),
  basicId: z
    .string()
    .describe("LINE Official Account basic ID (e.g. @abc123)."),
  pictureUrl: z.string().nullable().describe("Account picture URL."),
  createdAt: z.date(),
})

export const connectLineResponse = z.object({
  id: z.string().describe("LINE channel (integration) id."),
  inboxId: z.string().describe("Inbox this channel feeds. See `inboxes.list`."),
  name: z.string(),
  basicId: z.string(),
  webhook: lineWebhookStatusResource,
})

export const testLineWebhookResponse = z.object({
  success: z.boolean().describe("Whether LINE's webhook test succeeded."),
  reason: z.string().optional().describe("LINE's reason when it failed."),
  active: z
    .boolean()
    .describe('Whether the console\'s "Use webhook" toggle is on.'),
})

export type LineChannelResource = z.infer<typeof lineChannelResource>
