/** Contact filter API route paths, shared by the route definition and the workspace authorization gate that keys off it. */
export const FILTER_VALUE_LABELS_POST_PATH =
  "/workspaces/{workspaceId}/contact-filter/value-labels"

/** Workspace-token twin of the value-label lookup (pure read, POST for the id lists). */
export const FILTER_VALUE_LABELS_TOKEN_PATH = "/v1/contacts/filter-value-labels"
