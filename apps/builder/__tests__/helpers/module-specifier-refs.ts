import {
  type ExportAllDeclaration,
  type ExportNamedDeclaration,
  type ImportDeclaration,
  parseSync,
} from "oxc-parser"

export type ModuleSpecifierRef = {
  kind: "import" | "export"
  specifier: string
  /** True if the statement pulls in at least one runtime value (not type-only). */
  isValue: boolean
}

/** `import a`, `import * as a`, or `import { a, type B }` — a value import unless everything is type-only. */
function importHasValueBinding(statement: ImportDeclaration) {
  if (statement.importKind === "type") {
    return false
  }
  return statement.specifiers.some(
    (specifier) =>
      specifier.type !== "ImportSpecifier" || specifier.importKind !== "type",
  )
}

/** `export * from`, `export * as a from`, or `export { a, type B } from` — a value re-export unless everything is type-only. */
function exportHasValueBinding(
  statement: ExportAllDeclaration | ExportNamedDeclaration,
) {
  if (statement.exportKind === "type") {
    return false
  }
  if (statement.type === "ExportAllDeclaration") {
    return true
  }
  return statement.specifiers.some(
    (specifier) => specifier.exportKind !== "type",
  )
}

/**
 * Every top-level import / re-export module specifier in a TS or TSX file.
 * Throws on a parse error so a guard test never passes by skipping a file it
 * could not read.
 */
export function findModuleSpecifierRefs(
  filePath: string,
  source: string,
): ModuleSpecifierRef[] {
  const { program, errors } = parseSync(filePath, source, {
    lang: filePath.endsWith(".tsx") ? "tsx" : "ts",
    sourceType: "module",
  })
  if (errors.length > 0) {
    throw new Error(
      `Failed to parse ${filePath}: ${errors.map((error) => error.message).join("; ")}`,
    )
  }

  const refs: ModuleSpecifierRef[] = []

  for (const statement of program.body) {
    if (statement.type === "ImportDeclaration") {
      refs.push({
        kind: "import",
        specifier: statement.source.value,
        isValue: importHasValueBinding(statement),
      })
    } else if (
      (statement.type === "ExportAllDeclaration" ||
        statement.type === "ExportNamedDeclaration") &&
      statement.source
    ) {
      refs.push({
        kind: "export",
        specifier: statement.source.value,
        isValue: exportHasValueBinding(statement),
      })
    }
  }

  return refs
}
