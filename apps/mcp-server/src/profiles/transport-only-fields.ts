/**
 * Response properties only the transport may see, never the model, on every
 * connector profile.
 */
export const TRANSPORT_ONLY_RESPONSE_PROPERTIES: Readonly<
  Record<string, readonly string[]>
> = {
  // `principal` is the verified identity used to bind a session.
  token_get: ["principal"],
}
