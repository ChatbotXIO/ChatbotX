/**
 * `Connection`'s enums are defined in `@chatbotx.io/utils/connection` (same
 * rationale as `channelTypes` in `./channel.ts`) so packages that cannot
 * depend on the database layer can still reference these values. Re-exported
 * here as the conventional database-layer import site.
 */
export {
  ACTIVE_CONNECTION_STATUSES,
  CONNECTION_TO_INBOX_DISCONNECT_REASON,
  type ConnectionKind,
  type ConnectionStatus,
  type ConnectionStatusReason,
  type ConnectSessionErrorCode,
  type ConnectSessionPurpose,
  type ConnectSessionStatus,
  connectionKinds,
  connectionStatuses,
  connectionStatusReasons,
  connectSessionErrorCodes,
  connectSessionPurposes,
  connectSessionStatuses,
  INACTIVE_CONNECTION_STATUSES,
} from "@chatbotx.io/utils/connection"
