#!/usr/bin/env node
// Shrinks production source maps to first-party code so `--enable-source-maps`
// stays affordable at runtime.
//
//   node scripts/prune-sourcemaps.mjs <dir>
//
// Node decodes every mapping segment of every loaded map up front, and ~80% of
// the segments point into node_modules. Measured on the worker `standalone`
// bundle: full maps cost +511MB heap, pruned maps +114MB — while frames in
// apps/, packages/ and integrations/ still resolve to `.ts:line:col`.
//
// Each run of node_modules segments collapses into ONE unmapped segment
// (`[generatedColumn]`) instead of being deleted: deleting them makes a library
// frame inherit the previous first-party mapping, pointing at the wrong file.
// With the marker, library frames keep their (unminified) bundle position.
// `sourcesContent` is dropped too — stack traces never read it.
//
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { decode, encode } from "@jridgewell/sourcemap-codec"

function isThirdParty(source) {
  return source.includes("node_modules")
}

function pruneSegments(line, keepSource) {
  const kept = []
  let isInUnmappedRun = false
  for (const segment of line) {
    if (segment.length === 1 || !keepSource[segment[1]]) {
      if (!isInUnmappedRun) {
        kept.push([segment[0]])
      }
      isInUnmappedRun = true
      continue
    }
    kept.push(segment)
    isInUnmappedRun = false
  }
  return kept
}

function pruneMap(map) {
  const keepSource = map.sources.map((source) => !isThirdParty(source))
  const { sourcesContent: _dropped, ...rest } = map
  return {
    ...rest,
    mappings: encode(
      decode(map.mappings).map((line) => pruneSegments(line, keepSource)),
    ),
  }
}

function* walkMaps(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      yield* walkMaps(path)
    } else if (path.endsWith(".map")) {
      yield path
    }
  }
}

function main() {
  const [dir] = process.argv.slice(2)
  if (!(dir && process.argv.length === 3)) {
    console.error("Usage: prune-sourcemaps.mjs <dir>")
    process.exit(1)
  }

  let bytesBefore = 0
  let bytesAfter = 0
  let mapCount = 0
  for (const path of walkMaps(dir)) {
    const raw = readFileSync(path, "utf8")
    const pruned = JSON.stringify(pruneMap(JSON.parse(raw)))
    bytesBefore += raw.length
    bytesAfter += pruned.length
    writeFileSync(path, pruned)
    mapCount += 1
  }

  // A build that stopped emitting maps would otherwise "succeed" and ship
  // unmapped stack traces.
  if (mapCount === 0) {
    console.error(`prune-sourcemaps: no .map files found in ${dir}`)
    process.exit(1)
  }

  const mb = (bytes) => `${Math.round(bytes / 1024 / 1024)}MB`
  console.log(
    `prune-sourcemaps: ${dir} ${mb(bytesBefore)} -> ${mb(bytesAfter)}`,
  )
}

main()
