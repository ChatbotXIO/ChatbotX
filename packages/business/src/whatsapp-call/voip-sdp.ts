/** A whole `a=setup:actpass` attribute line, at session or media level, LF or CRLF. */
const ACTPASS_SETUP_LINE = /^a=setup:actpass(?=\r?$)/gm

/**
 * Pins the DTLS role in Meta's SDP answer to an outbound (business-initiated)
 * call. The browser's offer carries `a=setup:actpass`, and Meta echoes
 * `actpass` back in its answer — which RFC 5763 §5 forbids: an answerer must
 * pick `active` or `passive`. Browsers reject such an answer (libwebrtc:
 * "Answerer must use either active or passive value for setup attribute"),
 * so the call signals fine but `setRemoteDescription` fails and no media
 * ever flows.
 *
 * `active` is what an answer with no setup attribute means (RFC 4145 §4), and
 * it is the role a browser already assumes for an answerer that leaves it out.
 * Only a whole `actpass` line is rewritten; an answer that already names a
 * role passes through untouched.
 */
export const pinAnswerDtlsSetup = (sdp: string): string =>
  sdp.replace(ACTPASS_SETUP_LINE, "a=setup:active")
