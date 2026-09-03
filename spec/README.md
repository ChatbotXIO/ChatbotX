# SDD Rules and Templates

This directory contains Spec-Driven Development artifacts for ChatbotX-fibrazo.

## Workflow
The SDD workflow follows these phases:
1. **Spec** - Define what and why
2. **Plan** - Define how and approval gates
3. **Tasks** - Execute with owned responsibilities
4. **Validate** - Verify quality gates
5. **Context** - Document outcomes

## Artifact Requirements
- All artifacts must be markdown (.md) files
- `spec.md` is mandatory for non-trivial work
- `plan.md` required before any coding begins
- `task.md` must declare Owners for each item
- `context.md` mandatory when iteration closes
- Docs updates must target `docs/context/{domain}/{topic}.md`

## Approval Gates
- Each phase transition requires explicit user approval
- "I like it" or "sounds good" = feedback, NOT approval
- Partial approval does not satisfy the gate
- Must receive "ok", "aprobado", or "approved" explicitly

## Domains with Context Docs
- database - Database schema and query patterns
- tenancy - Multi-tenant architecture
- flow - Flow configuration and nodes
- feature - New feature integration
- api - API surface changes