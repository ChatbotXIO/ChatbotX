/** A whole `a=setup:actpass` attribute line, at session or media level, LF or CRLF. */
const ACTPASS_SETUP_LINE = /^a=setup:actpass(?=\r?$)/gm

/**
 * Meta echoes `a=setup:actpass` back in its SDP answer, which RFC 5763 §5
 * forbids (an answerer must pick `active`/`passive`) — browsers reject it, so
 * `setRemoteDescription` fails silently and no media flows. `active` is what
 * RFC 4145 §4 implies for an answer with no setup attribute, so it's a safe
 * rewrite. An answer that already names a role passes through untouched.
 */
export const pinAnswerDtlsSetup = (sdp: string): string =>
  sdp.replace(ACTPASS_SETUP_LINE, "a=setup:active")
