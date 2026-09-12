import {
  type FreeswitchEventKind,
  type FreeswitchEventVars,
  freeswitchEventKinds,
} from "@chatbotx.io/worker-config"

/**
 * Raw ESL event headers (wire format: `variable_<name>` for
 * channel variables, bare names like `Event-Name`/`Unique-ID` for the
 * event's own fields). This module is CHANNEL-AGNOSTIC by design — it
 * knows only `cbx_*` correlation
 * vars, generic SIP fields and FreeSWITCH's own event framing, never
 * WhatsApp semantics (wacid, Meta headers). WhatsApp interpretation of the
 * resulting `KeptFreeswitchEvent` lives only in
 * `apps/worker/src/integration/handlers/whatsapp-freeswitch.ts`.
 */
export type RawEslHeaders = Readonly<Record<string, string>>

export type KeptFreeswitchEvent = {
  event: FreeswitchEventKind
  workspaceId: string
  integrationId: string
  uuid: string
  vars: FreeswitchEventVars
}

/**
 * Custom INVITE headers the dialplan `export`s become `variable_sip_h_<name>`
 * (no casing normalization). Only headers under these prefixes
 * are copied into `vars.sipHeaders`, filtered case-insensitively; anything
 * else FreeSWITCH attaches to the event is dropped before it ever reaches a
 * queue (keeps ESL event volume bounded).
 */
const SIP_HEADER_VAR_PREFIX = "variable_sip_h_"
const ALLOWED_SIP_HEADER_PREFIXES = ["x-wa-meta-", "x-cbx-"]

const VARIABLE_PREFIX = "variable_"

const resolveEventKind = (
  headers: RawEslHeaders,
): FreeswitchEventKind | null => {
  const name = headers["Event-Name"]
  if (!name) {
    return null
  }
  const candidate =
    name === "CUSTOM" ? `CUSTOM:${headers["Event-Subclass"] ?? ""}` : name
  const parsed = freeswitchEventKinds.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

const extractSipHeaders = (headers: RawEslHeaders): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (!key.toLowerCase().startsWith(SIP_HEADER_VAR_PREFIX)) {
      continue
    }
    const headerName = key.slice(SIP_HEADER_VAR_PREFIX.length).toLowerCase()
    if (
      ALLOWED_SIP_HEADER_PREFIXES.some((prefix) =>
        headerName.startsWith(prefix),
      )
    ) {
      out[headerName] = value
    }
  }
  return out
}

/** Reads a `variable_<name>` header, case-sensitive (matches FreeSWITCH's own casing). */
const variable = (headers: RawEslHeaders, name: string): string | undefined =>
  headers[`${VARIABLE_PREFIX}${name}`]

const extractVars = (headers: RawEslHeaders): FreeswitchEventVars => ({
  sipFromUser: variable(headers, "sip_from_user"),
  sipToUser: variable(headers, "sip_to_user"),
  sipHeaders: extractSipHeaders(headers),
  hangupCause: variable(headers, "hangup_cause"),
  sipTermStatus: variable(headers, "sip_term_status"),
  otherLegUuid: headers["Other-Leg-Unique-ID"],
  rootUuid: variable(headers, "cbx_root_uuid"),
  attemptId: variable(headers, "cbx_attempt_id"),
  recordFilePath:
    headers["Record-File-Path"] ?? variable(headers, "record_file_path"),
})

/**
 * Registration-event subclasses that can be kept off the `agents` profile
 * without any `cbx_*` var. VERIFIED against `signalwire/freeswitch` v1.10.12
 * `src/mod/endpoints/mod_sofia/sofia_reg.c`: `sofia::register` fires with
 * `profile-name`, `from-user` (the registered AOR user id — our
 * `ag-<ws>-<u>`), `from-host`, `contact`, `call-id`, `status`, `expires`
 * (seconds, string), `to-user`, `to-host`, `network-ip`, `network-port`,
 * `username`, `realm`, `user-agent`, optionally `update-reg=true`
 * (`sofia_reg.c:2060-2077`). `sofia::unregister` fires with the SAME
 * `from-user`/`from-host` shape plus `username`, `call-id`, `realm`,
 * `network-ip`, `network-port`, `user-agent`, `expires`
 * (`sofia_reg.c:2214-2225`). `sofia::expire` is the ODD ONE OUT — it has NO
 * `from-user`; the user id is `user`/`username` and the host is `host`
 * (`sofia_reg.c:727-742`, fired by the registration-expiry sweep rather than
 * a live REGISTER, so there is no "From" header to name it after).
 */
const REGISTRATION_IDENTITY_HEADERS_BY_SUBCLASS: Record<
  "sofia::register" | "sofia::unregister" | "sofia::expire",
  { userHeader: string; hostHeader: string }
> = {
  "sofia::register": { userHeader: "from-user", hostHeader: "from-host" },
  "sofia::unregister": { userHeader: "from-user", hostHeader: "from-host" },
  "sofia::expire": { userHeader: "user", hostHeader: "host" },
}

/**
 * Client-side keep-rule: an event is enqueued only if it carries
 * the exported `cbx_integration_id`/`cbx_workspace_id` correlation vars
 * (every channel event after the dialplan's `set`/`export`, on both legs of
 * a bridged call), or is a `sofia::*` event on the `agents` profile, or a
 * `sofia::gateway_state` event. Everything else is dropped WITHOUT a DB read
 * — this function never touches the database.
 *
 * `sofia::register|unregister|expire` and `sofia::gateway_state` carry no
 * `cbx_*` vars (they are not tied to a call), so their workspace/integration
 * resolution is deliberately NOT done here (this file must stay
 * WhatsApp-agnostic) — the raw username / gateway name is passed through in
 * `vars.sipFromUser` / `vars.sipToUser` for the business-layer handler
 * (`apps/worker/src/integration/handlers/whatsapp-freeswitch.ts`) to parse.
 * Header names are VERIFIED — see
 * {@link REGISTRATION_IDENTITY_HEADERS_BY_SUBCLASS} for the register/
 * unregister/expire citation and the `sofia::gateway_state` doc below.
 */
export const applyFreeswitchKeepRule = (
  headers: RawEslHeaders,
): KeptFreeswitchEvent | null => {
  const kind = resolveEventKind(headers)
  if (!kind) {
    return null
  }
  const uuid = headers["Unique-ID"]
  if (!uuid) {
    return null
  }

  const integrationId = variable(headers, "cbx_integration_id")
  const workspaceId = variable(headers, "cbx_workspace_id")
  if (integrationId && workspaceId) {
    return {
      event: kind,
      workspaceId,
      integrationId,
      uuid,
      vars: extractVars(headers),
    }
  }

  const registrationSubclass = agentProfileRegistrationSubclass(kind, headers)
  if (registrationSubclass) {
    const { userHeader } =
      REGISTRATION_IDENTITY_HEADERS_BY_SUBCLASS[registrationSubclass]
    return {
      event: kind,
      workspaceId: "",
      integrationId: "",
      uuid,
      vars: {
        ...extractVars(headers),
        sipFromUser: headers[userHeader],
        sipToUser: headers.contact,
        sipTermStatus: headers.expires,
      },
    }
  }

  if (kind === "CUSTOM:sofia::gateway_state") {
    // VERIFIED: `sofia_reg_fire_custom_gateway_state_event`
    // (`sofia_reg.c:157-169`) — `Gateway`, `State` (`sofia_state_string`),
    // `Ping-Status`, optional `Phrase`, and a numeric `Status` present only
    // on failures.
    const gateway = headers.Gateway
    if (!gateway) {
      return null
    }
    return {
      event: kind,
      workspaceId: "",
      integrationId: "",
      uuid,
      vars: {
        ...extractVars(headers),
        sipToUser: gateway,
        sipTermStatus: headers.State,
      },
    }
  }

  return null
}

const agentProfileRegistrationSubclass = (
  kind: FreeswitchEventKind,
  headers: RawEslHeaders,
): "sofia::register" | "sofia::unregister" | "sofia::expire" | null => {
  if (headers["profile-name"] !== "agents") {
    return null
  }
  if (kind === "CUSTOM:sofia::register") {
    return "sofia::register"
  }
  if (kind === "CUSTOM:sofia::unregister") {
    return "sofia::unregister"
  }
  if (kind === "CUSTOM:sofia::expire") {
    return "sofia::expire"
  }
  return null
}
