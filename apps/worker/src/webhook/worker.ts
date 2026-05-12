import {
  WebhookJobAction,
  type WebhookJobData,
} from "@chatbotx.io/worker-config"
import { createBullMQWorker } from "../lib/create-worker"
import { WebhookMatcherService } from "./services/webhook-matcher.service"

const webhookMatcher = new WebhookMatcherService()

await createBullMQWorker<WebhookJobData>({
  name: "webhook",
  bootstrap: false,
  label: "webhook",
  handlers: {
    [WebhookJobAction.evaluateWebhooks]: (data) =>
      webhookMatcher.findAndExecuteWebhooks(data),
  },
})
