/**
 * Generates src/profiles/openai-manifest.json from a public OpenAPI document.
 * Usage: tsx scripts/generate-openai-manifest.ts <public-spec.json>
 * The output is a reviewed contract: commit it, never regenerate at runtime.
 * The builder test `public-spec-mcp.test.ts` fails when it drifts from the spec.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { buildOpenAiManifest } from "../src/profiles/openai-manifest-builder"

const specPath = process.argv[2]
if (!specPath) {
  throw new Error("Usage: generate-openai-manifest <public-spec.json>")
}

const manifest = buildOpenAiManifest(JSON.parse(readFileSync(specPath, "utf8")))
writeFileSync(
  new URL("../src/profiles/openai-manifest.json", import.meta.url),
  `${JSON.stringify(manifest, null, 2)}\n`,
)
process.stdout.write(`Wrote ${manifest.tools.length} tools\n`)
