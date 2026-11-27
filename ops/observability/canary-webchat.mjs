import { setTimeout as sleep } from "node:timers/promises"

const required = [
  "CANARY_BUILDER_URL",
  "CANARY_WEBCHAT_WORKSPACE_ID",
  "CANARY_WEBCHAT_ID",
  "CANARY_WEBCHAT_ACCESS_TOKEN",
  "CANARY_WEBCHAT_ORIGIN",
  "CANARY_GUEST_CONVERSATION_ID",
  "CANARY_EXPECTED_FLOW_TEXT",
  "RELEASE_SHA",
]

const missing = required.filter((name) => !process.env[name])
if (missing.length > 0) {
  throw new Error(
    `Missing required canary configuration: ${missing.join(", ")}`,
  )
}

const timeoutMs = Number.parseInt(process.env.CANARY_TIMEOUT_MS ?? "60000", 10)
if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
  throw new Error("CANARY_TIMEOUT_MS must be a positive integer")
}

const builderUrl = new URL(process.env.CANARY_BUILDER_URL)
const guestMessagesUrl = new URL("/api/guest/messages", builderUrl)
const origin = process.env.CANARY_WEBCHAT_ORIGIN
const accessToken = process.env.CANARY_WEBCHAT_ACCESS_TOKEN
const marker = `canary:${process.env.RELEASE_SHA}:${crypto.randomUUID()}`
const deadline = Date.now() + timeoutMs
const pollIntervalMs = 2000

const headers = {
  authorization: `Bearer ${accessToken}`,
  "content-type": "application/json",
  origin,
}

const request = {
  workspaceId: process.env.CANARY_WEBCHAT_WORKSPACE_ID,
  webchatId: process.env.CANARY_WEBCHAT_ID,
  parentOrigin: origin,
  guestConversationId: process.env.CANARY_GUEST_CONVERSATION_ID,
}

const fetchBeforeDeadline = async (url, init) => {
  const remainingMs = deadline - Date.now()
  if (remainingMs <= 0) {
    throw new Error("Canary deadline elapsed")
  }
  return await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(Math.min(10_000, remainingMs)),
  })
}

const sendResponse = await fetchBeforeDeadline(guestMessagesUrl, {
  method: "POST",
  headers,
  body: JSON.stringify({ ...request, text: marker }),
})
if (!sendResponse.ok) {
  throw new Error(`Canary webchat send failed with HTTP ${sendResponse.status}`)
}

const search = new URLSearchParams(request)
let passed = false
while (Date.now() < deadline) {
  const response = await fetchBeforeDeadline(`${guestMessagesUrl}?${search}`, {
    headers,
  })
  if (!response.ok) {
    throw new Error(`Canary webchat read failed with HTTP ${response.status}`)
  }

  const body = await response.json()
  const messages = Array.isArray(body?.data) ? body.data : []
  const markerMessage = messages.find((message) => message?.text === marker)
  const markerCreatedAt = Date.parse(markerMessage?.createdAt ?? "")
  const hasCorrelatedFlowResponse = messages.some(
    (message) =>
      message?.messageType === "outgoing" &&
      Date.parse(message.createdAt ?? "") >= markerCreatedAt &&
      typeof message.text === "string" &&
      message.text.includes(process.env.CANARY_EXPECTED_FLOW_TEXT),
  )
  if (
    markerMessage &&
    Number.isFinite(markerCreatedAt) &&
    hasCorrelatedFlowResponse
  ) {
    console.log(`Webchat canary passed for release ${process.env.RELEASE_SHA}`)
    passed = true
    break
  }

  await sleep(Math.min(pollIntervalMs, deadline - Date.now()))
}

if (!passed) {
  throw new Error(
    `Webchat canary did not persist the message and flow response within ${timeoutMs}ms`,
  )
}
