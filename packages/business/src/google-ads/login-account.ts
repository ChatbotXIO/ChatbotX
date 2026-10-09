type LoginAccountInput = {
  /** The Google Ads account the user connected (a client or a manager). */
  customerId: string
  /** The manager the user reaches `customerId` through; `null` when reached directly. */
  loginCustomerId: string | null
  /** The account that owns the conversion actions (the Data Manager operating account). */
  conversionCustomerId: string
}

/**
 * The Data Manager `Destination.loginAccount`: the account whose credentials
 * make the call, which must have write access to the operating account
 * (https://developers.google.com/data-manager/api/reference/rest/v1/Destination).
 *
 * - Operating account is the connected account: the route that reached it
 *   (the manager, or the account itself when reached directly).
 * - Operating account is a different account (cross-account conversion action,
 *   typically owned by a manager): the connected account has no write access to
 *   it, so go through the same manager route when there is one, otherwise sign
 *   in directly as the owner of the actions.
 *
 * The single source for delivery, `validateIngest` and anything else sending
 * through Data Manager.
 */
export const resolveLoginAccountId = (input: LoginAccountInput): string =>
  input.conversionCustomerId === input.customerId
    ? (input.loginCustomerId ?? input.customerId)
    : (input.loginCustomerId ?? input.conversionCustomerId)
