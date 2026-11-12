# Account deletion

A user confirms account deletion by typing `DELETE` in the builder or by sending `{ "confirmation": "DELETE" }` to `DELETE /v1/me` with a mobile bearer token.

The request is idempotent. It schedules every owned workspace for its existing 24-hour deletion window, removes the user's memberships, ends web sessions, deletes mobile refresh and device tokens, and revokes OAuth tokens. A reseller tenant owner cannot self-delete and must contact support.

`User.deletionRequestedAt` and `User.scheduledDeletionAt` make the request durable. The schedule worker processes a bounded batch of due users every 30 minutes. It only deletes a user after every owned workspace has been purged, then completes the `ResourceDeletionLog` user row.

Pending-deletion users cannot create web sessions or receive mobile access/refresh tokens. Existing mobile access tokens are rejected by the mobile principal resolver.

Do not run `db:migrate` automatically. Apply the generated account-deletion migration only after explicit approval.
