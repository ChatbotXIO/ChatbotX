#!/usr/bin/env node
// Shrinks production source maps to first-party code so `--enable-source-maps`
// stays affordable at runtime.
//
//   node scripts/prune-sourcemaps.mjs <dir> [--copy-to <dir>]
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
// `--copy-to` writes each pruned map next to the matching `.js` file under
// another tree (Next standalone output only copies the page-level maps).
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
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
  // Index maps (Turbopack) nest regular maps under `sections[].map`.
  if (map.sections) {
    return {
      ...map,
      sections: map.sections.map((section) => ({
        ...section,
        map: pruneMap(section.map),
      })),
    }
  }
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

function fileExists(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function main() {
  const [dir, flag, copyTo] = process.argv.slice(2)
  if (!dir || (flag && flag !== "--copy-to") || (flag && !copyTo)) {
    console.error("Usage: prune-sourcemaps.mjs <dir> [--copy-to <dir>]")
    process.exit(1)
  }

  let bytesBefore = 0
  let bytesAfter = 0
  let copied = 0
  for (const path of walkMaps(dir)) {
    const raw = readFileSync(path, "utf8")
    const pruned = JSON.stringify(pruneMap(JSON.parse(raw)))
    bytesBefore += raw.length
    bytesAfter += pruned.length
    writeFileSync(path, pruned)

    if (copyTo) {
      const target = join(copyTo, relative(dir, path))
      if (fileExists(target.slice(0, -".map".length))) {
        writeFileSync(target, pruned)
        copied += 1
      }
    }
  }

  const mb = (bytes) => `${Math.round(bytes / 1024 / 1024)}MB`
  console.log(
    `prune-sourcemaps: ${dir} ${mb(bytesBefore)} -> ${mb(bytesAfter)}` +
      (copyTo ? `, ${copied} copied to ${copyTo}` : ""),
  )
}

main()
