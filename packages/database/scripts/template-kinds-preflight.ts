/**
 * Lists every `TemplateInstalledResource.resourceKind` value this build does
 * not know, with its row count. Run it before shipping a rename or removal of
 * a kind (readers skip and log such rows, but nothing should depend on that):
 *
 *   pnpm --filter @chatbotx.io/database template:kinds-preflight
 *
 * Exits 1 when unknown kinds exist.
 */
import { db } from "../src/client"
import { listUnknownResourceKinds } from "../src/repositories/template-installed-resource/kinds"

const unknown = await listUnknownResourceKinds(db)
if (unknown.length === 0) {
  process.stdout.write("No unknown template resource kinds.\n")
  process.exit(0)
}
for (const row of unknown) {
  process.stdout.write(`${row.resourceKind}\t${row.rows}\n`)
}
process.exit(1)
