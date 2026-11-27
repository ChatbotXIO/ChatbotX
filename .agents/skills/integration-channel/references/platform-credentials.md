## Platform Credentials (only if needed)

If platform credentials ARE needed, also update:

| #   | File                                           | What to add                                                                                                                       |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/database/src/partials/credential.ts` | Add `<channel>` to `credentialTypes`, a `<channel>CredentialSchema` (+ public `.pick()`), and entries in `credentialSchemas` and `credentialPublicSchemas`                                                               |
| 2   | `apps/builder/src/features/platform-credentials/` | Settings panel component + action                                                                                                 |
| 3   | `manage-platform-credentials.tsx`                 | Import and render new panel                                                                                                       |
| 4   | `<channel>-manage.tsx`                         | Gate "Add" button on presence of a verified credential via `platformCredentialService.findForUser({ userId, type: '<channel>' })` |
