import {
  agentSipPresenceRepository,
  integrationWhatsappRepository,
  userSoftphoneCredentialRepository,
  whatsappCallRepository,
  workspaceSipNodeRepository,
} from "@chatbotx.io/database/repositories"
import { encryptUtils } from "@chatbotx.io/encryption"
import { z } from "zod"
import { type FreeswitchNodes, resolveFreeswitchNode } from "./freeswitch-nodes"

const MAX_RING_TARGETS_DEFAULT = 8
const NOT_FOUND_DOCUMENT =
  '<document type="freeswitch/xml"><section name="result"><result status="not found"/></section></document>'

/** mod_xml_curl's posted form fields (the xml_curl hot path). */
export const xmlCurlRequestSchema = z
  .object({
    hostname: z.string().min(1),
    section: z.enum(["configuration", "directory", "dialplan"]),
    tag_name: z.string().optional(),
    key_name: z.string().optional(),
    key_value: z.string().optional(),
    "Caller-Destination-Number": z.string().optional(),
    "Caller-Context": z.string().optional(),
    "variable_sip_h_X-CBX-Attempt": z.string().optional(),
    "variable_sip_h_x-wa-meta-wacid": z.string().optional(),
    variable_sofia_profile_name: z.string().optional(),
  })
  .catchall(z.string().optional())
export type XmlCurlRequest = z.infer<typeof xmlCurlRequestSchema>

export type XmlSection = XmlCurlRequest["section"]

/** Escapes a value for safe interpolation into FreeSWITCH XML attribute/text content. */
export const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")

const DESTINATION_NUMBER_RE = /^\+?\d{8,15}$/
const ATTEMPT_ID_RE = /^[a-z0-9]{1,40}$/i
const AGENT_SIP_USERNAME_RE = /^ag-\d+-\d+$/
const DIGITS_RE = /^\+?\d{6,15}$/

// FreeSWITCH channel-variable placeholders, LITERAL in the generated
// dialplan XML (FreeSWITCH itself expands them at call time — they must
// never be interpolated here). Built by concatenation so the source never
// contains a literal "${...}" substring (which would trip
// `noTemplateCurlyInString` as a forgotten template placeholder).
// biome-ignore lint/complexity/noUselessStringConcat: intentional — see comment above
const FS_VAR_UUID = "$" + "{uuid}"
// biome-ignore lint/complexity/noUselessStringConcat: intentional — see FS_VAR_UUID
const FS_VAR_DOMAIN = "$" + "{domain}"
// biome-ignore lint/complexity/noUselessStringConcat: intentional — see FS_VAR_UUID
const FS_VAR_US_RING = "$" + "{us-ring}"

export type FreeswitchXmlServiceDeps = {
  nodes: FreeswitchNodes
  /**
   * Absolute path of the recordings volume INSIDE the FreeSWITCH container
   * (the same path the co-located `freeswitch` worker reads). Passed
   * in literally — FreeSWITCH's own `recordings_dir` global points at its
   * package default, not the shared volume.
   */
  recordingsDir: string
  maxRingTargets?: number
}

const recordingPathFor = (recordingsDir: string, workspaceId: string): string =>
  `${escapeXml(recordingsDir)}/wa/${escapeXml(workspaceId)}/${FS_VAR_UUID}.ogg`

const param = (name: string, value: string): string =>
  `<param name="${escapeXml(name)}" value="${escapeXml(value)}"/>`

const buildDocument = (sectionName: string, body: string): string =>
  `<document type="freeswitch/xml"><section name="${escapeXml(sectionName)}">${body}</section></document>`

/** `configuration/sofia.conf`: this node's WhatsApp gateways, decrypted server-side only here. */
const renderConfiguration = async (
  request: XmlCurlRequest,
  deps: FreeswitchXmlServiceDeps,
): Promise<string> => {
  if (request.key_value !== "sofia.conf") {
    return NOT_FOUND_DOCUMENT
  }
  if (!deps.nodes[request.hostname]) {
    return NOT_FOUND_DOCUMENT
  }

  const integrations =
    await integrationWhatsappRepository.listProvisionedForXml(request.hostname)
  const gateways = await Promise.all(
    integrations
      .filter(
        (integration) =>
          integration.sipGatewayName && integration.sipPasswordEncrypted,
      )
      .map(async (integration) => {
        const password = await encryptUtils.decryptText(
          // biome-ignore lint/style/noNonNullAssertion: filtered above
          integration.sipPasswordEncrypted!,
        )
        return `<gateway name="${escapeXml(integration.sipGatewayName ?? "")}">${param(
          "username",
          integration.displayPhoneNumber.replace(/\D/g, ""),
        )}${param("from-user", integration.displayPhoneNumber.replace(/\D/g, ""))}${param(
          "password",
          password,
        )}${param("realm", "wa.meta.vc")}${param("proxy", "wa.meta.vc:5061;transport=tls")}${param(
          "register",
          "false",
        )}${param("caller-id-in-from", "false")}</gateway>`
      }),
  )

  return buildDocument(
    "configuration",
    `<configuration name="sofia.conf"><profiles><profile name="whatsapp"><gateways>${gateways.join("")}</gateways></profile></profiles></configuration>`,
  )
}

/** `directory/<domain>`: business-number and agent SIP users, both scoped to the posting node. */
const renderDirectory = async (
  request: XmlCurlRequest,
  deps: FreeswitchXmlServiceDeps,
): Promise<string> => {
  const node = deps.nodes[request.hostname]
  const username = request.key_value ?? ""
  if (!(node && request.key_name === "id" && username)) {
    return NOT_FOUND_DOCUMENT
  }

  if (AGENT_SIP_USERNAME_RE.test(username)) {
    const credential =
      await userSoftphoneCredentialRepository.findActiveBySipUsername(username)
    if (!credential) {
      return NOT_FOUND_DOCUMENT
    }
    // Node-secret isolation: an agent credential is only served to
    // the node its workspace is pinned to — node A's xml_curl secret must
    // never yield a workspace-on-node-B agent password.
    const pin = await workspaceSipNodeRepository.findByWorkspaceId(
      credential.workspaceId,
    )
    if (pin?.nodeId !== request.hostname) {
      return NOT_FOUND_DOCUMENT
    }
    const password = await encryptUtils.decryptText(
      credential.passwordEncrypted,
    )
    return buildDocument(
      "directory",
      `<domain name="${escapeXml(node.sipDomain)}"><user id="${escapeXml(username)}">${param(
        "password",
        password,
      )}</user></domain>`,
    )
  }

  if (!DIGITS_RE.test(username)) {
    return NOT_FOUND_DOCUMENT
  }
  const digits = username.replace(/\D/g, "")
  const integrations =
    await integrationWhatsappRepository.listProvisionedForXml(request.hostname)
  const integration = integrations.find(
    (row) => row.displayPhoneNumber.replace(/\D/g, "") === digits,
  )
  if (!(integration?.sipPasswordEncrypted && integration.sipGatewayName)) {
    return NOT_FOUND_DOCUMENT
  }
  const password = await encryptUtils.decryptText(
    integration.sipPasswordEncrypted,
  )
  return buildDocument(
    "directory",
    `<domain name="${escapeXml(node.sipDomain)}"><user id="${escapeXml(username)}">${param(
      "password",
      password,
    )}</user></domain>`,
  )
}

const bridgeTarget = (domain: string, userId: string): string =>
  `user/${userId}@${domain}`

/** `dialplan` context `whatsapp_inbound` — inbound Meta leg into the ring set. */
const renderInboundDialplan = async (
  request: XmlCurlRequest,
  deps: FreeswitchXmlServiceDeps,
): Promise<string> => {
  const destinationNumber = request["Caller-Destination-Number"] ?? ""
  if (!DESTINATION_NUMBER_RE.test(destinationNumber)) {
    return NOT_FOUND_DOCUMENT
  }
  const node = deps.nodes[request.hostname]
  if (!node) {
    return NOT_FOUND_DOCUMENT
  }
  const digits = destinationNumber.replace(/\D/g, "")
  const integrations =
    await integrationWhatsappRepository.listProvisionedForXml(request.hostname)
  const integration = integrations.find(
    (row) => row.displayPhoneNumber.replace(/\D/g, "") === digits,
  )
  if (!integration) {
    return NOT_FOUND_DOCUMENT
  }

  const limit = deps.maxRingTargets ?? MAX_RING_TARGETS_DEFAULT
  const targetUserIds = await agentSipPresenceRepository.selectRingTargets({
    workspaceId: integration.workspaceId,
    inboxId: integration.inboxId,
    limit,
  })

  const wacid = request["variable_sip_h_x-wa-meta-wacid"]
  const setActions = [
    `<action application="set" data="cbx_wacid=${escapeXml(wacid ?? "")}"/>`,
    `<action application="export" data="cbx_integration_id=${escapeXml(integration.id)}"/>`,
    `<action application="export" data="cbx_workspace_id=${escapeXml(integration.workspaceId)}"/>`,
    `<action application="export" data="cbx_root_uuid=${FS_VAR_UUID}"/>`,
    `<action application="event" data="Event-Name=CUSTOM,Event-Subclass=cbx::call,cbx_phase=inbound"/>`,
    `<action application="set" data="rtp_secure_media=mandatory:AES_CM_128_HMAC_SHA1_80"/>`,
    `<action application="set" data="RECORD_STEREO=true"/>`,
    `<action application="set" data="record_waste_resources=true"/>`,
    `<action application="answer"/>`,
    `<action application="set" data="transfer_ringback=${FS_VAR_US_RING}"/>`,
    `<action application="set" data="call_timeout=25"/>`,
    `<action application="set" data="hangup_after_bridge=true"/>`,
    `<action application="set" data="continue_on_fail=true"/>`,
    integration.callRecordingEnabled
      ? `<action application="set" data="record_sample_rate=16000"/>`
      : null,
    integration.callRecordingEnabled
      ? `<action application="record_session" data="${recordingPathFor(deps.recordingsDir, integration.workspaceId)}"/>`
      : null,
  ].filter((line): line is string => line !== null)

  const bridgeAction =
    targetUserIds.length > 0
      ? `<action application="export" data="sip_h_X-CBX-Root-UUID=${FS_VAR_UUID}"/><action application="bridge" data="{ignore_early_media=true}${targetUserIds
          .map((userId) =>
            bridgeTarget(
              node.sipDomain,
              `ag-${integration.workspaceId}-${userId}`,
            ),
          )
          .join(",")}"/>`
      : `<action application="playback" data="ivr/no_agent.wav"/>`

  return buildDocument(
    "dialplan",
    `<context name="whatsapp_inbound"><extension name="inbound"><condition field="destination_number" expression="^\\+?\\d+$">${setActions.join(
      "",
    )}${bridgeAction}<action application="hangup"/></condition></extension></context>`,
  )
}

/** `dialplan` context `agents` — outbound business-initiated leg. */
const renderOutboundDialplan = async (
  request: XmlCurlRequest,
  deps: FreeswitchXmlServiceDeps,
): Promise<string> => {
  const destinationNumber = request["Caller-Destination-Number"] ?? ""
  const attemptId = request["variable_sip_h_X-CBX-Attempt"] ?? ""
  if (
    !(
      DESTINATION_NUMBER_RE.test(destinationNumber) &&
      ATTEMPT_ID_RE.test(attemptId)
    )
  ) {
    return NOT_FOUND_DOCUMENT
  }
  const node = deps.nodes[request.hostname]
  if (!node) {
    return NOT_FOUND_DOCUMENT
  }

  // The attempt row (inserted by `startWhatsappCallAction` BEFORE the
  // browser dials) names the inbox → integration this call leaves
  // through. It must be pinned to THIS node — an attempt for another node's
  // number gets `not found` (the browser dialed the wrong host).
  const attempt = await whatsappCallRepository.findByAttemptId(attemptId)
  if (!attempt) {
    return NOT_FOUND_DOCUMENT
  }
  const integrations =
    await integrationWhatsappRepository.listProvisionedForXml(request.hostname)
  const integration = integrations.find(
    (candidate) =>
      candidate.inboxId === attempt.inboxId &&
      candidate.workspaceId === attempt.workspaceId,
  )
  if (!integration) {
    return NOT_FOUND_DOCUMENT
  }
  const digits = destinationNumber.replace(/\D/g, "")

  const setActions = [
    `<action application="export" data="cbx_integration_id=${escapeXml(integration.id)}"/>`,
    `<action application="export" data="cbx_workspace_id=${escapeXml(integration.workspaceId)}"/>`,
    `<action application="export" data="cbx_root_uuid=${FS_VAR_UUID}"/>`,
    `<action application="export" data="cbx_attempt_id=${escapeXml(attemptId)}"/>`,
    `<action application="event" data="Event-Name=CUSTOM,Event-Subclass=cbx::call,cbx_phase=outbound"/>`,
    `<action application="set" data="rtp_secure_media=mandatory:AES_CM_128_HMAC_SHA1_80"/>`,
    `<action application="export" data="sip_h_X-CBX-Attempt=${escapeXml(attemptId)}"/>`,
    `<action application="set" data="effective_caller_id_number=${escapeXml(digits)}"/>`,
    `<action application="set" data="sip_from_user=${escapeXml(digits)}"/>`,
    `<action application="set" data="sip_from_host=${FS_VAR_DOMAIN}"/>`,
    `<action application="set" data="sip_invite_req_uri=sip:${escapeXml(destinationNumber)}@wa.meta.vc;transport=tls"/>`,
    `<action application="set" data="hangup_after_bridge=true"/>`,
    integration.callRecordingEnabled
      ? `<action application="set" data="record_sample_rate=16000"/>`
      : null,
    integration.callRecordingEnabled
      ? `<action application="record_session" data="${recordingPathFor(deps.recordingsDir, integration.workspaceId)}"/>`
      : null,
    `<action application="bridge" data="sofia/gateway/${escapeXml(
      integration.sipGatewayName ?? "",
    )}/${escapeXml(destinationNumber)}"/>`,
  ].filter((line): line is string => line !== null)

  return buildDocument(
    "dialplan",
    `<context name="agents"><extension name="outbound"><condition field="destination_number" expression="^\\+\\d{8,15}$">${setActions.join(
      "",
    )}</condition></extension></context>`,
  )
}

/** Registry of dialplan contexts keyed by `variable_sofia_profile_name` (registry pattern, one context per profile). */
const DIALPLAN_RENDERERS_BY_PROFILE: Record<
  string,
  (request: XmlCurlRequest, deps: FreeswitchXmlServiceDeps) => Promise<string>
> = {
  whatsapp: renderInboundDialplan,
  agents: renderOutboundDialplan,
}

const renderDialplan = async (
  request: XmlCurlRequest,
  deps: FreeswitchXmlServiceDeps,
): Promise<string> => {
  const profile = request.variable_sofia_profile_name
  const renderer = profile ? DIALPLAN_RENDERERS_BY_PROFILE[profile] : undefined
  if (!renderer) {
    return NOT_FOUND_DOCUMENT
  }
  return await renderer(request, deps)
}

/** `XML_SECTION_RENDERERS`: the table-driven dispatch by mod_xml_curl `section`. */
export const XML_SECTION_RENDERERS: Record<
  XmlSection,
  (request: XmlCurlRequest, deps: FreeswitchXmlServiceDeps) => Promise<string>
> = {
  configuration: renderConfiguration,
  directory: renderDirectory,
  dialplan: renderDialplan,
}

/**
 * Pure render entry point — the route only authenticates and forwards
 *. Validates `hostname` against the known node set BEFORE any DB
 * read; an unknown node is `not found`, never an error.
 */
export const renderFreeswitchXml = async (
  rawRequest: unknown,
  deps: FreeswitchXmlServiceDeps,
): Promise<string> => {
  const parsed = xmlCurlRequestSchema.safeParse(rawRequest)
  if (!parsed.success) {
    return NOT_FOUND_DOCUMENT
  }
  const request = parsed.data
  if (!resolveNodeSafely(deps.nodes, request.hostname)) {
    return NOT_FOUND_DOCUMENT
  }
  return await XML_SECTION_RENDERERS[request.section](request, deps)
}

const resolveNodeSafely = (
  nodes: FreeswitchNodes,
  hostname: string,
): boolean => {
  try {
    resolveFreeswitchNode(nodes, hostname)
    return true
  } catch {
    return false
  }
}
