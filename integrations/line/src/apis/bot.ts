import type {
  LineAuthValue,
  LineBotInfo,
  LineWebhookEndpoint,
  LineWebhookTestResult,
} from "../schema"
import { lineFetch } from "./client"

export const getBotInfo = (auth: LineAuthValue): Promise<LineBotInfo> =>
  lineFetch<LineBotInfo>(auth, { method: "GET", path: "/v2/bot/info" })

export async function setWebhookEndpoint(
  auth: LineAuthValue,
  url: string,
): Promise<void> {
  await lineFetch<unknown>(auth, {
    method: "PUT",
    path: "/v2/bot/channel/webhook/endpoint",
    body: { endpoint: url },
  })
}

export const getWebhookEndpoint = (
  auth: LineAuthValue,
): Promise<LineWebhookEndpoint> =>
  lineFetch<LineWebhookEndpoint>(auth, {
    method: "GET",
    path: "/v2/bot/channel/webhook/endpoint",
  })

export const testWebhookEndpoint = (
  auth: LineAuthValue,
): Promise<LineWebhookTestResult> =>
  lineFetch<LineWebhookTestResult>(auth, {
    method: "POST",
    path: "/v2/bot/channel/webhook/test",
    body: {},
  })
