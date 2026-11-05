#!/usr/bin/env node
/**
 * End-to-end regression run of the Templates feature through the public API
 * only (no database access), so it works against any environment. See
 * `docs/templates-testing.md` for setup and for what each check covers.
 *
 * Required env:
 *   CHATBOTX_API_URL         e.g. https://localhost:3123/api
 *   TPL_SOURCE_TOKEN         `templates`-scoped full token of the publishing workspace
 *   TPL_TARGET_TOKEN         `templates`-scoped full token of another workspace (same tenant)
 *   TPL_TARGET_RO_TOKEN      read_only token of the target workspace
 * Optional:
 *   TPL_KEEP=1               keep the template and the installed copies afterwards
 *   NODE_EXTRA_CA_CERTS=<path> to trust a local development certificate
 *
 * Every created item is named `e2e-tpl <run id>`; the run cleans up after itself
 * by uninstalling the copies and deleting the template.
 */

const env = (name) => {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing ${name}; see docs/templates-testing.md`)
    process.exit(2)
  }
  return value
}

const API = env("CHATBOTX_API_URL").replace(/\/$/, "")
const TOKENS = {
  src: env("TPL_SOURCE_TOKEN"),
  tgt: env("TPL_TARGET_TOKEN"),
  ro: env("TPL_TARGET_RO_TOKEN"),
}
const RUN = `e2e-tpl ${Date.now().toString(36)}`
const POLL_MS = 1500
const POLL_LIMIT_MS = 120_000
/** What a publisher payload must never carry: emails or raw workspace/installation ids. */
const RAW_ID_OR_EMAIL = /@|"workspaceId"|"installationId"/
const LONG_ID = /\d{14,20}/g

const results = []

const call = async (who, method, path, body, idempotencyKey) => {
  const headers = {
    authorization: `Bearer ${TOKENS[who]}`,
    "content-type": "application/json",
  }
  if (idempotencyKey) {
    headers["idempotency-key"] = idempotencyKey
  }
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: response.status, json }
}

const check = (id, ok, detail) => {
  results.push({ id, ok })
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${detail}`)
}

const must = async (label, promise) => {
  const response = await promise
  if (response.status >= 300) {
    console.error(
      `ABORT ${label}: ${response.status} ${JSON.stringify(response.json).slice(0, 400)}`,
    )
    process.exit(1)
  }
  return response.json
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const poll = async (read, done) => {
  const started = Date.now()
  for (;;) {
    const value = await read()
    if (done(value) || Date.now() - started > POLL_LIMIT_MS) {
      return value
    }
    await sleep(POLL_MS)
  }
}

const shareTokenOf = async (templateId) => {
  const link = await must(
    "link",
    call("src", "GET", `/v1/templates/${templateId}/link`),
  )
  return new URL(link.url).searchParams.get("key")
}

const waitInstalled = (installationId) =>
  poll(
    async () =>
      (await call("tgt", "GET", `/v1/template-installations/${installationId}`))
        .json,
    (detail) => !["pending", "installing"].includes(detail?.status),
  )

/** Public DELETE path per installed resource kind (kinds without one are skipped). */
const DELETE_PATH = {
  flow: "flows",
  aiAgent: "ai-agents",
  aiFile: "ai-files",
  aiFunction: "ai-functions",
  aiMcpServer: "ai-mcp-servers",
  calendar: "appointment-calendars",
  couponTopic: "coupon-topics",
  fbCommentAutomation: "fb-comments",
  automatedResponse: "keywords",
  pipeline: "pipelines",
  product: "products",
  questionnaire: "questionnaires",
  savedReply: "saved-replies",
  sequence: "sequences",
  trigger: "triggers",
  integrationWebchat: "webchats",
}

/** Category a copied kind is selected under, to try republishing it. */
const KIND_CATEGORY = {
  flow: "flows",
  aiAgent: "aiAgents",
  aiFile: "aiFiles",
  aiFunction: "aiFunctions",
  aiMcpServer: "aiMcpServers",
  calendar: "calendars",
  couponTopic: "couponTopics",
  fbCommentAutomation: "fbCommentAutomations",
  automatedResponse: "keywords",
  pipeline: "pipelines",
  product: "products",
  questionnaire: "questionnaires",
  reflink: "entryPointLinks",
  savedReply: "settings",
  sequence: "sequences",
  trigger: "triggers",
  integrationWebchat: "webchats",
}

const CATEGORIES = Object.values(KIND_CATEGORY).filter(
  (category, index, all) => all.indexOf(category) === index,
)

/** Selects up to 2 items per category; the first of each is view-only. */
const buildSelection = async () => {
  const selection = {}
  for (const category of CATEGORIES) {
    const page = await must(
      `selectable ${category}`,
      call(
        "src",
        "GET",
        `/v1/templates/selectable-resources?category=${category}&limit=2`,
      ),
    )
    const ids = page.items.filter((item) => !item.locked).map((item) => item.id)
    if (ids.length > 0) {
      selection[category] = { mode: "ids", ids, lockedIds: [ids[0]] }
    }
  }
  return selection
}

/** Ids of the source workspace's resources: none may survive in an installed copy. */
const sourceResourceIds = async (selection) => {
  const ids = new Set(
    Object.values(selection).flatMap((choice) => choice.ids ?? []),
  )
  for (const category of ["tags", "customFields"]) {
    const page = await call(
      "src",
      "GET",
      `/v1/templates/selectable-resources?category=${category}&limit=200`,
    )
    for (const item of page.json?.items ?? []) {
      ids.add(item.id)
    }
  }
  return ids
}

const checkReferences = async (selection, resources) => {
  const sourceIds = await sourceResourceIds(selection)
  const flows = resources.filter(
    (resource) => resource.created && resource.resourceKind === "flow",
  )
  const leaks = []
  for (const flow of flows) {
    const body = JSON.stringify(
      (await call("tgt", "GET", `/v1/flows/${flow.resourceId}`)).json,
    )
    for (const id of body.match(LONG_ID) ?? []) {
      if (sourceIds.has(id)) {
        leaks.push(`${flow.label ?? flow.resourceId}:${id}`)
      }
    }
  }
  check(
    "REFERENCES",
    flows.length > 0 && leaks.length === 0,
    `${flows.length} installed flows, source ids left: ${leaks.join(", ") || "none"}`,
  )
}

const checkDeleteLocks = async (resources) => {
  const attempts = resources.filter(
    (resource) => resource.created && DELETE_PATH[resource.resourceKind],
  )
  let blocked = 0
  for (const resource of attempts) {
    const response = await call(
      "tgt",
      "DELETE",
      `/v1/${DELETE_PATH[resource.resourceKind]}/${resource.resourceId}`,
    )
    if (response.json?.code === "templateAllowDeleteViolation") {
      blocked += 1
    } else {
      check(
        "LOCK-DELETE",
        false,
        `${resource.resourceKind} ${resource.resourceId} -> ${response.status} ${response.json?.code}`,
      )
    }
  }
  check(
    "LOCK-DELETE",
    blocked === attempts.length,
    `${blocked}/${attempts.length} deletes refused`,
  )
}

const checkFlowLocks = async (resources) => {
  const flow = resources.find(
    (resource) =>
      resource.created && resource.locked && resource.resourceKind === "flow",
  )
  if (!flow) {
    check("LOCK-FLOW", false, "no view-only flow installed")
    return
  }
  const path = `/v1/flows/${flow.resourceId}`
  const rename = await call("tgt", "PATCH", path, { name: `${RUN} renamed` })
  const duplicate = await call("tgt", "POST", `${path}/duplicate`, {})
  const exported = await call("tgt", "GET", `${path}/export`)
  const statuses = [rename.status, duplicate.status, exported.status]
  check(
    "LOCK-FLOW",
    statuses.every((status) => status === 403),
    `rename/duplicate/export -> ${statuses.join("/")}`,
  )
}

const checkReadOnlyToken = async (installationId, shareToken) => {
  const install = await call(
    "ro",
    "POST",
    "/v1/template-installations",
    { shareToken, allowDuplicate: true },
    `${RUN}-ro`,
  )
  const sync = await call(
    "ro",
    "POST",
    `/v1/template-installations/${installationId}/sync`,
    {},
    `${RUN}-ro-sync`,
  )
  const patch = await call(
    "ro",
    "PATCH",
    `/v1/template-installations/${installationId}`,
    { autoUpdate: true },
  )
  const read = await call(
    "ro",
    "GET",
    `/v1/template-installations/${installationId}`,
  )
  const writes = [install.status, sync.status, patch.status]
  check(
    "READ-ONLY",
    writes.every((status) => status === 403) && read.status === 200,
    `install/sync/patch ${writes.join("/")}, read ${read.status}`,
  )
}

const checkReinstall = async (installationId, shareToken) => {
  const key = `${RUN}-reinstall`
  const first = await call(
    "tgt",
    "POST",
    "/v1/template-installations",
    { shareToken },
    key,
  )
  const replay = await call(
    "tgt",
    "POST",
    "/v1/template-installations",
    { shareToken },
    key,
  )
  check(
    "REINSTALL",
    first.status === 202 &&
      first.json?.installationId === installationId &&
      Boolean(first.json?.syncId) &&
      JSON.stringify(first.json) === JSON.stringify(replay.json),
    `${first.status} ${JSON.stringify(first.json)} replay equal=${JSON.stringify(first.json) === JSON.stringify(replay.json)}`,
  )
  await poll(
    async () =>
      (await call("tgt", "GET", `/v1/template-installations/${installationId}`))
        .json,
    (detail) => !detail?.syncInProgress,
  )
}

const checkRepublishRefused = async (resources) => {
  const locked = resources.filter(
    (resource) =>
      resource.created &&
      resource.locked &&
      KIND_CATEGORY[resource.resourceKind],
  )
  let refused = 0
  for (const resource of locked) {
    const response = await call("tgt", "POST", "/v1/templates", {
      name: `${RUN} republish`,
      selection: {
        [KIND_CATEGORY[resource.resourceKind]]: {
          mode: "ids",
          ids: [resource.resourceId],
        },
      },
      defaultPermissions: { allowEdit: true, allowDelete: true },
      createInstallFolder: false,
      defaultAutoUpdate: false,
    })
    if (response.json?.code === "templateIncludesViewOnlyCopy") {
      refused += 1
    } else if (response.status < 300) {
      await call("tgt", "DELETE", `/v1/templates/${response.json.id}`)
    }
  }
  check(
    "REPUBLISH",
    refused === locked.length,
    `${refused}/${locked.length} view-only copies refused`,
  )
}

const checkPublisherPrivacy = async (templateId) => {
  const installers = await call(
    "src",
    "GET",
    `/v1/templates/${templateId}/installers`,
  )
  const body = JSON.stringify(installers.json)
  const foreign = await call(
    "tgt",
    "GET",
    `/v1/templates/${templateId}/installers`,
  )
  check(
    "PUBLISHER-PRIVACY",
    installers.status === 200 &&
      !RAW_ID_OR_EMAIL.test(body) &&
      foreign.status === 404,
    `rows=${installers.json?.items?.length} foreign=${foreign.status}`,
  )
}

const checkUninstall = async (installationId) => {
  const preview = await must(
    "uninstall preview",
    call(
      "tgt",
      "GET",
      `/v1/template-installations/${installationId}/uninstall-preview`,
    ),
  )
  const readOnly = await call(
    "ro",
    "POST",
    `/v1/template-installations/${installationId}/uninstall`,
    {},
  )
  await must(
    "uninstall",
    call(
      "tgt",
      "POST",
      `/v1/template-installations/${installationId}/uninstall`,
      {},
      `${RUN}-uninstall`,
    ),
  )
  const detail = await poll(
    async () =>
      (await call("tgt", "GET", `/v1/template-installations/${installationId}`))
        .json,
    (value) => !["pending", "running"].includes(value?.uninstallState),
  )
  check(
    "UNINSTALL",
    readOnly.status === 403 &&
      detail.status === "uninstalled" &&
      JSON.stringify(detail.uninstallCounts) === JSON.stringify(preview),
    `read-only ${readOnly.status}, state ${detail.status}/${detail.uninstallState}, counts match preview=${JSON.stringify(detail.uninstallCounts) === JSON.stringify(preview)}`,
  )
}

const previewReason = async (token) => {
  const response = await call("tgt", "GET", `/v1/template-previews/${token}`)
  return response.json?.installable === true
    ? "installable"
    : (response.json?.reason ??
        response.json?.code ??
        `http ${response.status}`)
}

const checkShareLifecycle = async (templateId) => {
  const sharePath = `/v1/templates/${templateId}/share`
  const future = new Date(Date.now() + 86_400_000).toISOString()
  const past = new Date(Date.now() - 60_000).toISOString()
  const token = await shareTokenOf(templateId)

  await call("src", "PUT", sharePath, { enabled: true, expiresAt: future })
  const keptFuture = (await call("src", "PUT", sharePath, { enabled: true }))
    .json?.shareExpiresAt
  const live = await previewReason(token)
  await call("src", "PUT", sharePath, { enabled: true, expiresAt: past })
  const expired = await previewReason(token)
  await call("src", "PUT", sharePath, { enabled: true, expiresAt: null })
  await call("src", "PUT", sharePath, { enabled: false })
  const disabled = await previewReason(token)
  await call("src", "PUT", sharePath, { enabled: true })
  const bogus = await previewReason("not-a-real-token")
  await must("rotate", call("src", "POST", `${sharePath}/rotate`, {}))
  const rotated = await shareTokenOf(templateId)
  const oldAfterRotate = await previewReason(token)
  const newAfterRotate = await previewReason(rotated)

  const dead = [expired, disabled, bogus, oldAfterRotate]
  check(
    "SHARE",
    live === "installable" &&
      Boolean(keptFuture) &&
      dead.every((reason) => reason === dead[0] && reason !== "installable") &&
      newAfterRotate === "installable" &&
      rotated !== token,
    `live=${live} keptExpiry=${Boolean(keptFuture)} expired=${expired} disabled=${disabled} bogus=${bogus} oldAfterRotate=${oldAfterRotate} new=${newAfterRotate}`,
  )
  return rotated
}

const installationDetail = async (installationId) =>
  (await call("tgt", "GET", `/v1/template-installations/${installationId}`))
    .json

const checkAutoUpdate = async (template, selection, shareToken, manualId) => {
  const followed = await must(
    "install auto-update copy",
    call(
      "tgt",
      "POST",
      "/v1/template-installations",
      { shareToken, allowDuplicate: true },
      `${RUN}-auto`,
    ),
  )
  await waitInstalled(followed.installationId)
  // A new copy takes the template's default; the installer turns it on after.
  await must(
    "turn auto-update on",
    call(
      "tgt",
      "PATCH",
      `/v1/template-installations/${followed.installationId}`,
      { autoUpdate: true },
    ),
  )
  const before = await installationDetail(followed.installationId)
  const save = (nextSelection) =>
    call("src", "PUT", `/v1/templates/${template.id}`, {
      name: RUN,
      selection: nextSelection,
      defaultPermissions: { allowEdit: true, allowDelete: false },
      createInstallFolder: true,
      defaultAutoUpdate: false,
    })

  // An unchanged save creates no version, so nothing is pushed.
  await must("unchanged save", save(selection))
  await sleep(POLL_MS * 2)
  const unchanged = await installationDetail(followed.installationId)

  // A real change: drop one category.
  const [dropped] = Object.keys(selection)
  const { [dropped]: _removed, ...smaller } = selection
  await must("changed save", save(smaller))
  const synced = await poll(
    () => installationDetail(followed.installationId),
    (detail) =>
      detail.sourceVersion > before.sourceVersion && !detail.syncInProgress,
  )
  const syncs = (
    await call(
      "tgt",
      "GET",
      `/v1/template-installations/${followed.installationId}/syncs`,
    )
  ).json?.items
  const manual = await installationDetail(manualId)
  const manualSyncs = (
    await call("tgt", "GET", `/v1/template-installations/${manualId}/syncs`)
  ).json?.items
  check(
    "AUTO-UPDATE",
    unchanged.sourceVersion === before.sourceVersion &&
      synced.sourceVersion === before.sourceVersion + 1 &&
      syncs?.some((sync) => sync.trigger === "autoUpdate") &&
      manual.updateAvailable === true &&
      !manualSyncs?.some((sync) => sync.trigger === "autoUpdate"),
    `unchanged save v${unchanged.sourceVersion}, followed copy v${before.sourceVersion}->v${synced.sourceVersion} (${syncs?.map((sync) => sync.trigger).join(",")}), manual copy updateAvailable=${manual.updateAvailable}`,
  )
  return followed.installationId
}

const main = async () => {
  console.log(`Run ${RUN} against ${API}`)
  const selection = await buildSelection()
  const template = await must(
    "create template",
    call("src", "POST", "/v1/templates", {
      name: RUN,
      selection,
      defaultPermissions: { allowEdit: true, allowDelete: false },
      createInstallFolder: true,
      defaultAutoUpdate: false,
    }),
  )
  await must(
    "share",
    call("src", "PUT", `/v1/templates/${template.id}/share`, { enabled: true }),
  )
  const shareToken = await checkShareLifecycle(template.id)

  const preview = await call(
    "tgt",
    "GET",
    `/v1/template-previews/${shareToken}`,
  )
  check(
    "PREVIEW",
    preview.json?.installable === true,
    `installable=${preview.json?.installable}`,
  )

  const installed = await must(
    "install",
    call(
      "tgt",
      "POST",
      "/v1/template-installations",
      { shareToken, allowDuplicate: true },
      `${RUN}-install`,
    ),
  )
  const detail = await waitInstalled(installed.installationId)
  const codes = (detail.warningSummary ?? []).map((entry) => entry.code)
  check(
    "INSTALL",
    ["completed", "partial"].includes(detail.status) &&
      !codes.includes("flowNode"),
    `status ${detail.status}, warnings ${codes.join(",") || "none"}`,
  )

  const resources = (
    await must(
      "resources",
      call(
        "tgt",
        "GET",
        `/v1/template-installations/${installed.installationId}/resources?limit=200`,
      ),
    )
  ).items

  await checkReferences(selection, resources)
  await checkDeleteLocks(resources)
  await checkFlowLocks(resources)
  await checkReadOnlyToken(installed.installationId, shareToken)
  await checkReinstall(installed.installationId, shareToken)
  await checkRepublishRefused(resources)

  const retry = await call(
    "tgt",
    "POST",
    `/v1/template-installations/${installed.installationId}/retry`,
    {},
  )
  check(
    "RETRY-ACTIVE",
    retry.status === 409,
    `retry on ${detail.status} -> ${retry.status}`,
  )

  await checkPublisherPrivacy(template.id)
  const followedId = await checkAutoUpdate(
    template,
    selection,
    shareToken,
    installed.installationId,
  )

  if (process.env.TPL_KEEP !== "1") {
    await checkUninstall(installed.installationId)
    await call(
      "tgt",
      "POST",
      `/v1/template-installations/${followedId}/uninstall`,
      {},
      `${RUN}-uninstall-auto`,
    )
    await call("src", "DELETE", `/v1/templates/${template.id}`)
  }

  const failed = results.filter((result) => !result.ok)
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed`,
  )
  process.exit(failed.length > 0 ? 1 : 0)
}

await main()
