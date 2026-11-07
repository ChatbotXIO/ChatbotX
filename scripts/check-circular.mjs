import { readdir, readFile, writeFile } from "node:fs/promises"
import { dirname, extname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { parseSync } from "oxc-parser"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const baselinePath = join(
  repoRoot,
  "scripts/circular-dependencies-baseline.json",
)
const sourceDirectories = ["apps", "integrations", "packages"]
const sourceExtensions = new Set([".ts", ".tsx"])
const leadingSlashPattern = /^\//
const toRelativePath = (filePath) =>
  relative(repoRoot, filePath).split(sep).join("/")

const ignoredDirectories = new Set([
  ".next",
  "dist",
  "generated",
  "node_modules",
])

const collectSourceFiles = async (directory, sourceFiles) => {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) {
        continue
      }
      await collectSourceFiles(entryPath, sourceFiles)
      continue
    }

    if (
      entry.isFile() &&
      entryPath.includes(`${sep}src${sep}`) &&
      sourceExtensions.has(extname(entry.name))
    ) {
      sourceFiles.add(resolve(entryPath))
    }
  }
}

const resolveSourceFile = (candidatePath, sourceFiles) => {
  const candidates = [
    candidatePath,
    ...[...sourceExtensions].map((extension) => `${candidatePath}${extension}`),
    ...[...sourceExtensions].map((extension) =>
      join(candidatePath, `index${extension}`),
    ),
  ]

  return candidates.find((candidate) => sourceFiles.has(resolve(candidate)))
}

const readWorkspacePackages = async () => {
  const packages = new Map()

  for (const directory of sourceDirectories) {
    const directoryPath = join(repoRoot, directory)
    const entries = await readdir(directoryPath, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      const packagePath = join(directoryPath, entry.name)
      try {
        const packageJson = JSON.parse(
          await readFile(join(packagePath, "package.json"), "utf8"),
        )
        if (typeof packageJson.name === "string") {
          packages.set(packageJson.name, {
            exports: packageJson.exports,
            packagePath,
          })
        }
      } catch {
        // Source directories without a package manifest cannot be imported by name.
      }
    }
  }

  return packages
}

const resolveExport = (exports, subpath) => {
  const exportPath = subpath === "" ? "." : `./${subpath}`

  if (typeof exports === "string" && exportPath === ".") {
    return exports
  }

  if (!exports || typeof exports !== "object" || Array.isArray(exports)) {
    return
  }

  const exactMatch = exports[exportPath]
  if (typeof exactMatch === "string") {
    return exactMatch
  }

  for (const [key, value] of Object.entries(exports)) {
    if (
      typeof value === "string" &&
      key.startsWith("./") &&
      key.endsWith("*") &&
      exportPath.startsWith(key.slice(0, -1))
    ) {
      return value.replace("*", exportPath.slice(key.length - 1))
    }
  }
  return
}

const resolveWorkspaceImport = (specifier, workspacePackages, sourceFiles) => {
  const packageName = [...workspacePackages.keys()]
    .sort((left, right) => right.length - left.length)
    .find(
      (candidate) =>
        specifier === candidate || specifier.startsWith(`${candidate}/`),
    )

  if (!packageName) {
    return
  }

  const workspacePackage = workspacePackages.get(packageName)
  const subpath = specifier
    .slice(packageName.length)
    .replace(leadingSlashPattern, "")
  const exportedPath = resolveExport(workspacePackage.exports, subpath)

  if (exportedPath) {
    return resolveSourceFile(
      resolve(workspacePackage.packagePath, exportedPath),
      sourceFiles,
    )
  }

  return resolveSourceFile(
    join(workspacePackage.packagePath, "src", subpath),
    sourceFiles,
  )
}

const getLiteralSpecifier = (source) => {
  if (typeof source?.value === "string") {
    return source.value
  }

  if (source?.type !== "TemplateLiteral" || source.expressions.length > 0) {
    return null
  }

  return source.quasis[0]?.value.cooked ?? null
}

const collectDynamicImportSpecifiers = (node, specifiers) => {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectDynamicImportSpecifiers(item, specifiers)
    }
    return
  }

  if (!node || typeof node !== "object") {
    return
  }

  if (node.type === "ImportExpression") {
    const specifier = getLiteralSpecifier(node.source)
    if (specifier !== null) {
      specifiers.add(specifier)
    }
  }

  for (const value of Object.values(node)) {
    collectDynamicImportSpecifiers(value, specifiers)
  }
}

const findSpecifiers = (filePath, source) => {
  const { errors, program } = parseSync(filePath, source, {
    lang: filePath.endsWith(".tsx") ? "tsx" : "ts",
    sourceType: "module",
  })

  if (errors.length > 0) {
    throw new Error(
      `Failed to parse ${toRelativePath(filePath)}: ${errors
        .map((error) => error.message)
        .join("; ")}`,
    )
  }

  const specifiers = new Set()
  for (const statement of program.body) {
    if (statement.type === "ImportDeclaration") {
      specifiers.add(statement.source.value)
    } else if (
      (statement.type === "ExportAllDeclaration" ||
        statement.type === "ExportNamedDeclaration") &&
      statement.source
    ) {
      specifiers.add(statement.source.value)
    }
  }

  collectDynamicImportSpecifiers(program, specifiers)

  return [...specifiers]
}

const resolveImport = (filePath, specifier, workspacePackages, sourceFiles) => {
  if (specifier.startsWith(".")) {
    return resolveSourceFile(resolve(dirname(filePath), specifier), sourceFiles)
  }

  if (specifier.startsWith("@/")) {
    return resolveSourceFile(
      join(repoRoot, "apps", "builder", "src", specifier.slice(2)),
      sourceFiles,
    )
  }

  return resolveWorkspaceImport(specifier, workspacePackages, sourceFiles)
}

const findCyclicEdges = (graph) => {
  const components = []
  const indexes = new Map()
  const lowLinks = new Map()
  const onStack = new Set()
  const stack = []
  let nextIndex = 0

  const visit = (node) => {
    indexes.set(node, nextIndex)
    lowLinks.set(node, nextIndex)
    nextIndex += 1
    stack.push(node)
    onStack.add(node)

    for (const dependency of graph.get(node) ?? []) {
      if (!indexes.has(dependency)) {
        visit(dependency)
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node), lowLinks.get(dependency)),
        )
      } else if (onStack.has(dependency)) {
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node), indexes.get(dependency)),
        )
      }
    }

    if (lowLinks.get(node) !== indexes.get(node)) {
      return
    }

    const component = []
    while (true) {
      const member = stack.pop()
      onStack.delete(member)
      component.push(member)
      if (member === node) {
        break
      }
    }
    components.push(component)
  }

  for (const node of graph.keys()) {
    if (!indexes.has(node)) {
      visit(node)
    }
  }

  const cyclicEdges = new Set()
  for (const component of components) {
    const members = new Set(component)
    const isCycle =
      component.length > 1 || (graph.get(component[0]) ?? []).has(component[0])
    if (!isCycle) {
      continue
    }

    for (const member of component) {
      for (const dependency of graph.get(member) ?? []) {
        if (members.has(dependency)) {
          cyclicEdges.add(`${member} -> ${dependency}`)
        }
      }
    }
  }

  return [...cyclicEdges].sort()
}

const buildGraph = async () => {
  const sourceFiles = new Set()
  for (const directory of sourceDirectories) {
    await collectSourceFiles(join(repoRoot, directory), sourceFiles)
  }

  const workspacePackages = await readWorkspacePackages()
  const graph = new Map()

  for (const filePath of [...sourceFiles].sort()) {
    const source = await readFile(filePath, "utf8")
    const dependencies = new Set()

    for (const specifier of findSpecifiers(filePath, source)) {
      const dependency = resolveImport(
        filePath,
        specifier,
        workspacePackages,
        sourceFiles,
      )
      if (dependency) {
        dependencies.add(toRelativePath(dependency))
      }
    }

    graph.set(toRelativePath(filePath), dependencies)
  }

  return {
    cyclicEdges: findCyclicEdges(graph),
    sourceFileCount: sourceFiles.size,
  }
}

const writeBaseline = async (result) => {
  await writeFile(
    baselinePath,
    `${JSON.stringify({ version: 1, ...result }, null, 2)}\n`,
  )
  console.log(
    `Recorded ${result.cyclicEdges.length} circular dependency edges across ${result.sourceFileCount} source files.`,
  )
}

const main = async () => {
  const result = await buildGraph()

  if (process.argv.includes("--write-baseline")) {
    await writeBaseline(result)
    return
  }

  const baseline = JSON.parse(await readFile(baselinePath, "utf8"))
  if (baseline.version !== 1 || !Array.isArray(baseline.cyclicEdges)) {
    throw new Error("Invalid circular dependency baseline.")
  }

  const baselineEdges = new Set(baseline.cyclicEdges)
  const newEdges = result.cyclicEdges.filter((edge) => !baselineEdges.has(edge))
  if (newEdges.length > 0) {
    console.error("New circular dependency edges:")
    for (const edge of newEdges) {
      console.error(`- ${edge}`)
    }
    process.exitCode = 1
    return
  }

  console.log(
    `Checked ${result.sourceFileCount} source files; ${result.cyclicEdges.length} circular dependency edges match the baseline.`,
  )
}

await main()
