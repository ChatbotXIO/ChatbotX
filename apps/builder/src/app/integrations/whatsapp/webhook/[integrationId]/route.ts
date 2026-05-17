import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { integrationQueue } from "@chatbotx.io/worker-config"
import type { NextRequest } from "next/server"
import {
  findIntegrationWhatsappById,
  markWhatsappWebhookVerified,
} from "@/features/integration-whatsapp/queries"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"

const SIGNATURE_HEADER = "x-hub-signature-256"
const SIGNATURE_PREFIX = "sha256="
const MAX_CHALLENGE_LENGTH = 256

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const loadManualIntegration = async (integrationId: string) => {
  // must cache
  const row = await findIntegrationWhatsappById(integrationId)
  if (!row) {
    return null
  }

  const auth = row.auth as WhatsappAuthValue
  if (!auth.metadata?.isManual) {
    return null
  }

  return { row, auth }
}

const handleGet = async (req: NextRequest, integrationId: string) => {
  const result = await loadManualIntegration(integrationId)
  if (!result) {
    return json({ message: "Integration not found" }, 404)
  }

  const { auth } = result
  const params = req.nextUrl.searchParams
  const mode = params.get("hub.mode")
  const token = params.get("hub.verify_token")
  const challenge = params.get("hub.challenge")

  if (mode !== "subscribe" || !challenge) {
    return json({ message: "Invalid handshake" }, 400)
  }

  if (challenge.length > MAX_CHALLENGE_LENGTH) {
    return json({ message: "Challenge too long" }, 400)
  }

  if (token !== auth.verifyToken) {
    logger.warn(
      { integrationId },
      "Whatsapp manual webhook verify_token mismatch",
    )
    return json({ message: "Forbidden" }, 403)
  }

  await markWhatsappWebhookVerified(integrationId, auth)

  return new Response(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  })
}

const handlePost = async (req: NextRequest, integrationId: string) => {
  const result = await loadManualIntegration(integrationId)
  if (!result) {
    return json({ message: "Integration not found" }, 404)
  }

  const { auth } = result

  const signature = req.headers.get(SIGNATURE_HEADER)
  if (!signature?.startsWith(SIGNATURE_PREFIX)) {
    return json({ message: "Missing signature" }, 401)
  }

  const verified =
    Boolean(auth.metadata?.webhookVerifiedAt) ||
    Boolean(auth.metadata?.subscribeOverrideOk)
  if (!verified) {
    return json({ message: "Webhook not verified" }, 403)
  }

  const integration = integrations.whatsapp
  if (!integration?.handleRequest) {
    return json({ message: "Method is not implemented" }, 400)
  }

  try {
    const handlerResult = await integration.handleRequest({
      config: {
        verifyToken: auth.verifyToken,
        clientSecret: auth.clientSecret,
        manualIntegration: true,
        // biome-ignore lint/suspicious/noExplicitAny: pass-through config
      } as any,
      req,
      queue: integrationQueue,
    })

    return new Response(handlerResult as BodyInit)
  } catch (e: unknown) {
    return json({ message: (e as Error).message }, 400)
  }
}

const handle = async (
  req: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> },
) => {
  const { integrationId } = await params
  if (!integrationId) {
    return json({ message: "Missing integrationId" }, 400)
  }

  if (req.method === "GET") {
    return handleGet(req, integrationId)
  }

  return handlePost(req, integrationId)
}

export const GET = handle
export const POST = handle
