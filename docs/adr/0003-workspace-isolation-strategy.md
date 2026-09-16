# ADR 0003: Workspace isolation strategy

## Status

Accepted — isolation by convention. PostgreSQL Row-Level Security is proposed and
deferred.

## Context

Workspace data is isolated in application and repository code. Repository methods
accept `workspaceId` and include it in their queries and mutations, including
resource lookups that also receive an object identifier. PostgreSQL Row-Level
Security is not enabled today: the database migrations contain no `CREATE POLICY`
statements.

This convention is explicit and familiar to the codebase, but omitting a
workspace filter from a new or changed repository method can create a
cross-workspace access path.

## Decision

Continue using explicit `workspaceId` parameters and manual repository filters as
the current isolation boundary. Services and application handlers must pass the
resolved workspace scope into repositories rather than relying on ambient database
state.

## Deferred option: PostgreSQL Row-Level Security

PostgreSQL Row-Level Security remains proposed and deferred. It requires a
dedicated, staged rollout that proves transaction-pooler compatibility, issues
`SET LOCAL app.workspace_id` on every checked-out connection, and runs full
cross-workspace regression coverage before it can become an enforcement boundary.
It must not be enabled incrementally or assumed to protect queries that have not
been validated under that connection model.

## Consequences

The interim mitigation is a lint/test-based safety net pursued in parallel: a
workspace-scoping ratchet script and cross-workspace integration tests make new
unscoped repository access harder to introduce. These checks complement, rather
than replace, each repository method's explicit `workspaceId` filter.
