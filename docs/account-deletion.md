# Account deletion

A user confirms account deletion by typing `DELETE` in the builder or by sending `{ "confirmation": "DELETE" }` to `DELETE /v1/me` with a mobile bearer token.

The request is idempotent. It schedules every owned workspace for its existing 24-hour deletion window, removes the user's memberships, ends web sessions, deletes mobile refresh and device tokens, and revokes OAuth and Better Auth account tokens. A reseller tenant owner cannot self-delete and must contact support.

`User.deletionRequestedAt` and `User.scheduledDeletionAt` make the request durable. The schedule worker processes a bounded batch of due users every 30 minutes. It drains 5,000 user references at a time (conversation assignees, audit authors, note authors, and participants) in short transactions before deleting the user. If the drain needs more time, the worker records the user as pending and retries. On failure, it postpones the next attempt one hour. If a canceled owned workspace is discovered, it is rescheduled and deletion remains pending.

The mobile browser handoff consumes its code once within 60 seconds, creates a normal browser session, and redirects to `/account/delete`. The browser session's cookie cache lasts at most five minutes. It redirects a missing, expired, reused, or pending-deletion account to the appropriate sign-in or requested-deletion page without creating a session.

Contact notes remain after a user is deleted, including notes in other workspaces; their `createdById` is set to `null`.

Pending-deletion users cannot create web sessions or receive mobile access/refresh tokens. Existing mobile access tokens are rejected by the mobile principal resolver.

Do not run `db:migrate` automatically. Apply the generated account-deletion migration only after explicit approval.
