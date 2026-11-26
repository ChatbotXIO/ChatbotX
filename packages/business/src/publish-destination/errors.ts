import { notFoundException } from "../errors"

/** `PublishDestinationWorkspaceError.name` (matched by name so callers need no repository import). */
const WORKSPACE_ERROR_NAME = "PublishDestinationWorkspaceError"

/**
 * The error a business caller throws for a failed repository write: a
 * destination (or the feed / set that names it) of another workspace becomes
 * the same not-found as a destination that does not exist; anything else is
 * returned unchanged.
 */
export const mapDestinationScopeError = (err: unknown): unknown =>
  err instanceof Error && err.name === WORKSPACE_ERROR_NAME
    ? notFoundException("Destination not found")
    : err
