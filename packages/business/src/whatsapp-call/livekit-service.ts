import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  RoomServiceClient,
  S3Upload,
  SipClient,
  WebhookReceiver,
} from "livekit-server-sdk"
import { keys } from "./keys"

const AGENT_TOKEN_TTL_SECONDS = 60 * 60

type LivekitConfig = {
  url: string
  apiKey: string
  apiSecret: string
  sipDomain?: string
  sipOutboundTrunkId?: string
}

const resolveConfig = (): LivekitConfig | null => {
  const env = keys()
  if (!(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET)) {
    return null
  }
  return {
    url: env.LIVEKIT_URL,
    apiKey: env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
    sipDomain: env.LIVEKIT_SIP_DOMAIN,
    sipOutboundTrunkId: env.LIVEKIT_SIP_OUTBOUND_TRUNK_ID,
  }
}

const requireConfig = (): LivekitConfig => {
  const config = resolveConfig()
  if (!config) {
    throw new Error("LiveKit calling is not configured")
  }
  return config
}

/**
 * Server-side glue for in-app WhatsApp calling (beta): LiveKit tokens for
 * agents, room lifecycle, audio-only recording egress into the app's S3
 * bucket, and outbound SIP dials. Every method throws when LiveKit env keys
 * are absent — gate call sites with `isInAppCallingConfigured()`.
 */
class WhatsappLivekitService {
  isInAppCallingConfigured(): boolean {
    return resolveConfig() !== null
  }

  /** SIP host to register on Meta's calling settings; null when unset. */
  sipDomain(): string | null {
    return resolveConfig()?.sipDomain ?? null
  }

  isOutboundCallingConfigured(): boolean {
    return Boolean(resolveConfig()?.sipOutboundTrunkId)
  }

  /** Join token for an agent's browser; scoped to one room, audio-only use. */
  async createAgentToken(props: {
    roomName: string
    identity: string
    displayName?: string
  }): Promise<{ token: string; url: string }> {
    const config = requireConfig()
    const token = new AccessToken(config.apiKey, config.apiSecret, {
      identity: props.identity,
      name: props.displayName,
      ttl: AGENT_TOKEN_TTL_SECONDS,
    })
    token.addGrant({
      room: props.roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    })
    return { token: await token.toJwt(), url: config.url }
  }

  /**
   * Ends the call for everyone: deleting the room removes the SIP
   * participant, which hangs up the WhatsApp leg (SIP BYE).
   */
  async endCall(roomName: string): Promise<void> {
    const config = requireConfig()
    const rooms = new RoomServiceClient(
      config.url,
      config.apiKey,
      config.apiSecret,
    )
    await rooms.deleteRoom(roomName)
  }

  /** Deterministic per-call object path the recording egress writes to. */
  buildCallRecordingPath(props: {
    workspaceId: string
    wacid: string
  }): string {
    const sanitizedWacid = props.wacid.replace(/[^a-zA-Z0-9._-]/g, "_")
    return `public/space/${props.workspaceId}/calls/${sanitizedWacid}.ogg`
  }

  /**
   * Starts an audio-only recording of the call room, uploaded straight into
   * the app's S3 bucket at a deterministic per-call path. Returns the
   * object path the finished file will land at.
   */
  async startCallRecording(props: {
    roomName: string
    workspaceId: string
    wacid: string
  }): Promise<{ recordingPath: string; egressId: string }> {
    const config = requireConfig()
    const env = keys()
    if (
      !(
        env.S3_ACCESS_KEY_ID &&
        env.S3_SECRET_ACCESS_KEY &&
        env.S3_BUCKET &&
        env.S3_REGION
      )
    ) {
      throw new Error("Call recording requires S3 storage configuration")
    }

    const recordingPath = this.buildCallRecordingPath(props)

    const egress = new EgressClient(config.url, config.apiKey, config.apiSecret)
    const info = await egress.startRoomCompositeEgress(
      props.roomName,
      {
        file: new EncodedFileOutput({
          filepath: recordingPath,
          disableManifest: true,
          output: {
            case: "s3",
            value: new S3Upload({
              accessKey: env.S3_ACCESS_KEY_ID,
              secret: env.S3_SECRET_ACCESS_KEY,
              bucket: env.S3_BUCKET,
              region: env.S3_REGION,
              endpoint: env.S3_ENDPOINT,
              forcePathStyle: Boolean(env.S3_ENDPOINT),
            }),
          },
        }),
      },
      { audioOnly: true },
    )

    return { recordingPath, egressId: info.egressId }
  }

  /**
   * Dials the customer's WhatsApp number through the configured LiveKit SIP
   * outbound trunk (business-initiated call). The agent joins the same room
   * with a token from `createAgentToken`.
   */
  async startOutboundCall(props: {
    roomName: string
    phoneNumber: string
  }): Promise<void> {
    const config = requireConfig()
    if (!config.sipOutboundTrunkId) {
      throw new Error("LiveKit SIP outbound trunk is not configured")
    }
    const sip = new SipClient(config.url, config.apiKey, config.apiSecret)
    await sip.createSipParticipant(
      config.sipOutboundTrunkId,
      props.phoneNumber,
      props.roomName,
      { participantIdentity: `wa-${props.phoneNumber}` },
    )
  }

  /** Verifies and parses a LiveKit webhook request body. */
  async receiveWebhook(body: string, authorization: string) {
    const config = requireConfig()
    const receiver = new WebhookReceiver(config.apiKey, config.apiSecret)
    return await receiver.receive(body, authorization)
  }
}

export const whatsappLivekitService = new WhatsappLivekitService()
