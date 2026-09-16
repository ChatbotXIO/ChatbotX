# ADR 0001: Remove unused Kafka package

## Status

Accepted

## Context

The Kafka workspace package was fully implemented, but the message-queue factory only
created BullMQ producers and consumers. Setting `MESSAGING_PROVIDER=kafka` could
never select a working implementation and instead failed at runtime. Keeping the
package, its Docker configuration, and Kafka-specific environment examples made
the unsupported path appear available and caused the technical-stack documentation
to describe an aspirational design as deployed architecture.

## Decision

Remove the unused Kafka workspace package, its dependencies, and its supporting
Docker and environment configuration. Simplify the message-queue factory and its
configuration types to the BullMQ implementation that is actually used.

## Consequences

- Sequence dispatch remains on its existing BullMQ-over-Redis implementation.
- `docs/tech-stack.md` now documents the actual sequence scheduler design: 256
  hash buckets coordinated with Redlock.
- There is no Kafka provider setting or local Kafka deployment to maintain.
- Reintroducing Kafka requires a new, wired provider implementation and a new
  architecture decision record rather than reviving a dormant package.
