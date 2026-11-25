/**
 * Whether a workspace API token may see contact emails and phone numbers. A
 * token has no member record to hold the `emailAndPhone` permission, and a
 * superAdmin who can mint one already has them in the builder, so tokens always
 * may. The broadcast and Posts public APIs both read this; it lives in its own
 * dependency-free module so a public router can import it without the session
 * helpers `permissions.ts` pulls in.
 */
export const TOKEN_CALLER_CAN_VIEW_EMAIL_AND_PHONE = true
