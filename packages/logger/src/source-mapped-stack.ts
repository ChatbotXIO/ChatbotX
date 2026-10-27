import { findSourceMap } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// `    at fn (/path/file.js:1:2)` or `    at /path/file.js:1:2`
const FRAME_PATTERN = /^(\s+at (?:.*? \()?)(.+?):(\d+):(\d+)(\)?)$/

function resolveOriginalSource(source: string, generatedFile: string): string {
  if (source.startsWith("file://")) {
    return fileURLToPath(source)
  }
  if (source.startsWith(".")) {
    return resolve(dirname(generatedFile), source)
  }
  return source
}

function mapFrame(line: string): string {
  const match = FRAME_PATTERN.exec(line)
  if (!match) {
    return line
  }
  const [, prefix, file, lineNumber, column, suffix] = match
  const sourceMap = findSourceMap(file)
  if (!sourceMap) {
    return line
  }
  const entry = sourceMap.findEntry(Number(lineNumber) - 1, Number(column) - 1)
  if (!("originalSource" in entry && entry.originalSource)) {
    return line
  }
  const source = resolveOriginalSource(entry.originalSource, file)
  return `${prefix}${source}:${entry.originalLine + 1}:${entry.originalColumn + 1}${suffix}`
}

/**
 * Resolves bundle frames in `stack` to original source positions.
 *
 * Node applies `--enable-source-maps` to `error.stack` itself, but Next.js
 * replaces `Error.prepareStackTrace` and only source-maps errors printed via
 * `util.inspect` — so pino's `err.stack` stays on minified chunk positions.
 * This maps each frame through the maps Node already loaded; it is a no-op
 * without `--enable-source-maps` and for frames that are already original
 * (the worker) or deliberately unmapped (pruned node_modules segments).
 */
export function sourceMapStack(stack: string): string {
  if (!process.sourceMapsEnabled) {
    return stack
  }
  try {
    return stack.split("\n").map(mapFrame).join("\n")
  } catch {
    // Never let a malformed map turn one error log into a second failure.
    return stack
  }
}
