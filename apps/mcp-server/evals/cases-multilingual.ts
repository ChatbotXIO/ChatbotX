import { createHash } from "node:crypto"
import {
  EVAL_SEED,
  EVAL_TIME,
  EVAL_TIMEZONE,
  type EvalCase,
  type LegacyArgumentPredicate,
} from "./cases"

/**
 * Standalone multilingual probe corpus for the "MCP doesn't understand
 * simple Vietnamese requests" bug report. Kept separate from `cases.ts`
 * instead of widening its `Locale` union: that union backs
 * `Record<Locale, string>` on every one of the 46 existing families, so
 * adding a locale there forces a (rushed, unreviewed) translation onto
 * every unrelated family. This module reuses `EvalCase`'s shape but is its
 * own closed corpus, own hash, own split -- it never touches
 * `materializeCases()`/`corpusHash()` from `cases.ts`.
 *
 * Locales: `en` is the control. `vi-natural` is realistic chat phrasing
 * (particles, punctuation, no forced diacritic-stripping) -- deliberately
 * different from `cases.ts`'s terse `vi`/`vi-unaccented`/`colloquial`
 * variants. `es`, `fr`, and `zh` verify that the client translates diverse
 * user requests before calling the English-only MCP tool catalog.
 */
export type MultilingualLocale = "en" | "vi-natural" | "es" | "zh" | "fr"

const MULTILINGUAL_LOCALES: readonly MultilingualLocale[] = [
  "en",
  "vi-natural",
  "es",
  "zh",
  "fr",
]

type MultilingualFamilySource = Omit<
  EvalCase,
  | "argumentPredicates"
  | "id"
  | "locale"
  | "now"
  | "prompt"
  | "sequence"
  | "split"
  | "timezone"
> & {
  argumentPredicates: LegacyArgumentPredicate[]
  finalState?: { operation: string; status: number }
  prompts: Record<MultilingualLocale, string>
  sequence?: string[]
}

/**
 * The smoke matrix targets the multi-step and sibling-tool paths required for
 * regression triage. Prompts are realistic short chat requests -- natural
 * punctuation, polite particles, and no manual rewording for the MCP ranker.
 * A Vietnamese speaker reviewed the `vi-natural` variants rather than
 * machine-translating them only.
 */
const FAMILIES: MultilingualFamilySource[] = [
  {
    argumentPredicates: [
      { key: "identifier" },
      { includes: "VIP", key: "tags" },
    ],
    domain: "tags",
    expectedOutcome: "complete",
    expectedTools: ["contacts_add_tags_by_name"],
    family: "contact-tag-clear",
    finalState: { operation: "contacts_add_tags_by_name", status: 204 },
    forbiddenTools: ["contacts_set_tags"],
    sequence: ["contacts_add_tags_by_name"],
    prompts: {
      en: "Add the VIP tag to Ada.",
      es: "Añade la etiqueta VIP a Ada.",
      fr: "Ajoute l’étiquette VIP à Ada.",
      "vi-natural": "Gắn nhãn VIP cho khách Ada giúp mình nhé.",
      zh: "请给 Ada 添加 VIP 标签。",
    },
  },
  {
    argumentPredicates: [],
    domain: "tags",
    expectedOutcome: "clarify",
    expectedTools: ["contacts_list"],
    family: "contact-tag-ambiguous",
    finalState: { operation: "contacts_list", status: 200 },
    forbiddenTools: [
      "contacts_add_tags",
      "contacts_add_tags_by_name",
      "contacts_set_tags",
    ],
    sequence: ["contacts_list"],
    prompts: {
      en: "Add the VIP tag to An.",
      es: "Añade la etiqueta VIP a An.",
      fr: "Ajoute l’étiquette VIP à An.",
      "vi-natural": "Gắn nhãn VIP cho khách An giúp mình nhé.",
      zh: "请给 An 添加 VIP 标签。",
    },
  },
  {
    argumentPredicates: [
      { includes: "id:", key: "identifier" },
      { includes: "hello", key: "text" },
    ],
    domain: "messages",
    expectedOutcome: "complete",
    expectedTools: ["contacts_send_message"],
    family: "contact-message",
    finalState: { operation: "contacts_send_message", status: 204 },
    forbiddenTools: ["messages_create"],
    sequence: ["contacts_list", "contacts_send_message"],
    prompts: {
      en: "Send hello to Ada.",
      es: "Envía hello a Ada.",
      fr: "Envoie hello à Ada.",
      "vi-natural": "Gửi hello cho Ada giúp mình nhé.",
      zh: "请给 Ada 发送 hello。",
    },
  },
  {
    argumentPredicates: [
      { key: "conversationId", value: 41 },
      { includes: "received", key: "text" },
    ],
    domain: "messages",
    expectedOutcome: "complete",
    expectedTools: ["messages_create"],
    family: "conversation-reply",
    finalState: { operation: "messages_create", status: 201 },
    forbiddenTools: ["contacts_send_message"],
    sequence: ["conversations_get", "messages_create"],
    prompts: {
      en: "Reply to conversation 41: received.",
      es: "Responde a la conversación 41: recibido.",
      fr: "Réponds à la conversation 41 : reçu.",
      "vi-natural": "Trả lời hội thoại 41 là đã nhận nhé.",
      zh: "回复 41 号对话：已收到。",
    },
  },
  {
    argumentPredicates: [{ key: "spec" }],
    domain: "flows",
    expectedOutcome: "complete",
    expectedTools: ["flows_publish"],
    family: "flow-draft-validate-publish",
    finalState: { operation: "flows_publish", status: 204 },
    forbiddenTools: [],
    sequence: ["flows_create", "flows_validate", "flows_publish"],
    prompts: {
      en: "Create a welcome flow, validate its draft, then publish it.",
      es: "Crea un flujo de bienvenida, valida su borrador y publícalo.",
      fr: "Crée un flow de bienvenue, valide son brouillon puis publie-le.",
      "vi-natural":
        "Tạo flow chào mừng, kiểm tra bản nháp rồi publish giúp mình.",
      zh: "创建一个欢迎流程，验证草稿后发布。",
    },
  },
  {
    argumentPredicates: [{ key: "id" }],
    domain: "broadcasts",
    expectedOutcome: "complete",
    expectedTools: ["broadcasts_schedule"],
    family: "broadcast-draft-audience-schedule",
    finalState: { operation: "broadcasts_schedule", status: 200 },
    forbiddenTools: [],
    sequence: [
      "flows_list",
      "broadcasts_create",
      "broadcasts_get_audience",
      "broadcasts_schedule",
    ],
    prompts: {
      en: "Draft a VIP broadcast, review its audience, and schedule it for tomorrow at 9 AM.",
      es: "Prepara un broadcast para VIP, revisa su audiencia y prográmalo para mañana a las 9.",
      fr: "Prépare un broadcast pour les VIP, vérifie son audience et programme-le demain à 9 h.",
      "vi-natural":
        "Tạo nháp broadcast cho VIP, xem audience rồi lên lịch 9 giờ sáng mai.",
      zh: "起草一条发给 VIP 的群发消息，查看受众后安排明天上午 9 点发送。",
    },
  },
  {
    argumentPredicates: [
      { key: "calendarId" },
      { key: "contactId" },
      { key: "startAt" },
    ],
    domain: "appointments",
    expectedOutcome: "complete",
    expectedTools: ["appointments_book"],
    family: "appointment-book",
    finalState: { operation: "appointments_book", status: 201 },
    forbiddenTools: ["appointments_cancel"],
    sequence: [
      "contacts_list",
      "appointment_calendars_list",
      "appointments_book",
    ],
    prompts: {
      en: "Book Ada in the Sales calendar tomorrow at 9 AM Asia/Ho_Chi_Minh.",
      es: "Reserva una cita para Ada en el calendario Sales mañana a las 9, Asia/Ho_Chi_Minh.",
      fr: "Réserve un rendez-vous pour Ada dans le calendrier Sales demain à 9 h, Asia/Ho_Chi_Minh.",
      "vi-natural":
        "Đặt lịch cho Ada trên lịch Sales lúc 9 giờ sáng mai, múi giờ Asia/Ho_Chi_Minh nhé.",
      zh: "请在 Sales 日历中为 Ada 预约明天上午 9 点，时区 Asia/Ho_Chi_Minh。",
    },
  },
  {
    argumentPredicates: [
      { key: "calendarId" },
      { key: "contactId" },
      { key: "startAt" },
    ],
    domain: "appointments",
    expectedOutcome: "reject",
    expectedTools: ["appointments_book"],
    family: "appointment-unavailable",
    finalState: { operation: "appointments_book", status: 422 },
    forbiddenTools: ["appointments_cancel"],
    sequence: [
      "contacts_list",
      "appointment_calendars_list",
      "appointment_calendars_get_availability",
      "appointments_book",
    ],
    prompts: {
      en: "After checking Sales calendar availability, book Ada tomorrow at 9 AM Asia/Ho_Chi_Minh.",
      es: "Después de comprobar la disponibilidad del calendario Sales, reserva a Ada mañana a las 9, Asia/Ho_Chi_Minh.",
      fr: "Après avoir vérifié la disponibilité du calendrier Sales, réserve Ada demain à 9 h, Asia/Ho_Chi_Minh.",
      "vi-natural":
        "Sau khi xem lịch trống của lịch Sales, đặt Ada lúc 9 giờ sáng mai, múi giờ Asia/Ho_Chi_Minh nhé.",
      zh: "查看 Sales 日历的可用时间后，为 Ada 预约明天上午 9 点，时区 Asia/Ho_Chi_Minh。",
    },
  },
  {
    argumentPredicates: [
      { key: "from" },
      { key: "to" },
      { key: "timezone", value: EVAL_TIMEZONE },
    ],
    domain: "analytics",
    expectedOutcome: "complete",
    expectedTools: ["analytics_new_contacts_count"],
    family: "analytics-new",
    finalState: { operation: "analytics_new_contacts_count", status: 200 },
    forbiddenTools: [],
    sequence: ["analytics_new_contacts_count"],
    prompts: {
      en: "How many new contacts arrived today?",
      es: "¿Cuántos contactos nuevos llegaron hoy?",
      fr: "Combien de nouveaux contacts sont arrivés aujourd’hui ?",
      "vi-natural": "Hôm nay có bao nhiêu khách mới vậy?",
      zh: "今天新增了多少联系人？",
    },
  },
  {
    argumentPredicates: [
      { includes: "VIP", key: "tags" },
      { key: "sequenceIds" },
    ],
    domain: "sequences",
    expectedOutcome: "complete",
    expectedTools: ["contacts_subscribe_sequences"],
    family: "lead-nurture",
    finalState: { operation: "contacts_subscribe_sequences", status: 204 },
    forbiddenTools: ["contacts_send_message", "contacts_set_tags"],
    sequence: [
      "contacts_list",
      "contacts_add_tags_by_name",
      "contacts_subscribe_sequences",
    ],
    prompts: {
      en: "Find ada@example.com, add VIP without removing existing tags, then subscribe her to the sequence Nurture. Do not send a message now.",
      es: "Busca ada@example.com, añade VIP sin quitar etiquetas y suscríbela a la secuencia Nurture. No envíes mensajes ahora.",
      fr: "Trouve ada@example.com, ajoute VIP sans retirer les étiquettes, puis inscris-la à la séquence Nurture. N’envoie pas de message maintenant.",
      "vi-natural":
        "Tìm ada@example.com, thêm VIP giữ nhãn cũ rồi đăng ký chuỗi Nurture; chưa gửi tin.",
      zh: "查找 ada@example.com，添加 VIP 并保留现有标签，然后订阅 Nurture 序列。现在不要发送消息。",
    },
  },
  {
    argumentPredicates: [{ includes: "ORDER-OK", key: "text" }],
    domain: "messages",
    expectedOutcome: "complete",
    expectedTools: ["messages_create"],
    family: "conversation-channel-boundary",
    finalState: { operation: "messages_create", status: 201 },
    forbiddenTools: ["contacts_send_message"],
    sequence: ["messages_create"],
    prompts: {
      en: "Ada has Messenger and WhatsApp conversations. Reply only in conversation 41 on Messenger with 'ORDER-OK'; leave WhatsApp unchanged.",
      es: "Ada tiene conversaciones de Messenger y WhatsApp. Responde solo en la conversación 41 de Messenger con 'ORDER-OK'; no cambies WhatsApp.",
      fr: "Ada a des conversations Messenger et WhatsApp. Réponds uniquement dans la conversation 41 sur Messenger avec « ORDER-OK » ; laisse WhatsApp inchangé.",
      "vi-natural":
        "Ada có hội thoại Messenger và WhatsApp. Chỉ trả lời hội thoại 41 trên Messenger bằng 'ORDER-OK'; giữ WhatsApp nguyên.",
      zh: "Ada 有 Messenger 和 WhatsApp 对话。仅在 Messenger 的对话 41 中回复“ORDER-OK”；不要更改 WhatsApp。",
    },
  },
  {
    argumentPredicates: [{ key: "spec" }],
    domain: "flows",
    expectedOutcome: "complete",
    expectedTools: ["flows_create"],
    family: "flow-branch-draft-only",
    finalState: { operation: "flows_create", status: 201 },
    forbiddenTools: ["flows_publish", "contacts_send_message"],
    sequence: ["capabilities_get", "flows_create"],
    prompts: {
      en: "Create a draft welcome flow: send 'HELLO', wait one day, branch on custom field Lead score >= 10, then send 'VIP' or 'GENERAL'. Do not publish or send it to contacts.",
      es: "Crea un flujo de bienvenida en borrador: envía 'HELLO', espera un día, ramifica por el campo Lead score >= 10 y luego envía 'VIP' o 'GENERAL'. No lo publiques ni lo envíes a contactos.",
      fr: "Crée un flow de bienvenue en brouillon : envoie « HELLO », attends un jour, branche sur le champ Lead score >= 10, puis envoie « VIP » ou « GENERAL ». Ne le publie pas et ne l’envoie pas aux contacts.",
      "vi-natural":
        "Tạo flow chào mừng dạng nháp: gửi 'HELLO', chờ một ngày, rẽ nhánh theo trường Lead score >= 10, rồi gửi 'VIP' hoặc 'GENERAL'. Không publish hoặc gửi cho khách.",
      zh: "创建一个欢迎流程草稿：发送“HELLO”，等待一天，按自定义字段 Lead score >= 10 分支，然后发送“VIP”或“GENERAL”。不要发布或发送给联系人。",
    },
  },
  {
    argumentPredicates: [{ key: "contactFilter" }],
    domain: "broadcasts",
    expectedOutcome: "complete",
    expectedTools: ["broadcasts_get_audience"],
    family: "broadcast-draft-only",
    finalState: { operation: "broadcasts_getAudience", status: 200 },
    forbiddenTools: ["broadcasts_schedule"],
    sequence: ["flows_list", "broadcasts_create", "broadcasts_get_audience"],
    prompts: {
      en: "Create a Messenger broadcast draft using Welcome on Sales for VIP contacts, exclude Newsletter; show its audience. Do not schedule or send.",
      es: "Crea un borrador de difusión de Messenger con Welcome en Sales para contactos VIP, excluye Newsletter; muestra su audiencia. No programes ni envíes.",
      fr: "Crée un brouillon de diffusion Messenger utilisant Welcome sur Sales pour les contacts VIP, exclue Newsletter ; montre son audience. Ne planifie pas et n’envoie pas.",
      "vi-natural":
        "Tạo nháp broadcast Messenger dùng Welcome trên Sales cho khách VIP, loại Newsletter; hiển thị audience. Không lên lịch hoặc gửi.",
      zh: "创建一个 Messenger 群发草稿，在 Sales 上使用 Welcome，面向 VIP 联系人并排除 Newsletter；显示受众。不要安排或发送。",
    },
  },
  {
    argumentPredicates: [],
    domain: "permissions",
    expectedOutcome: "reject",
    expectedTools: ["contacts_add_tags"],
    family: "permission-denied",
    finalState: { operation: "contacts_addTags", status: 403 },
    forbiddenTools: ["contacts_set_tags", "contacts_send_message"],
    prompts: {
      en: "Add VIP to Ada.",
      es: "Añade VIP a Ada.",
      fr: "Ajoute VIP à Ada.",
      "vi-natural": "Thêm VIP cho Ada.",
      zh: "给 Ada 添加 VIP。",
    },
  },
  {
    argumentPredicates: [],
    domain: "contacts",
    expectedOutcome: "reject",
    expectedTools: ["contacts_get"],
    family: "missing-contact",
    finalState: { operation: "contacts_get", status: 404 },
    forbiddenTools: ["contacts_send_message"],
    prompts: {
      en: "Send 'HELLO' to missing@example.com.",
      es: "Envía 'HELLO' a missing@example.com.",
      fr: "Envoie « HELLO » à missing@example.com.",
      "vi-natural": "Gửi 'HELLO' cho missing@example.com.",
      zh: "向 missing@example.com 发送“HELLO”。",
    },
  },
  {
    argumentPredicates: [{ includes: "VIP", key: "tags" }],
    domain: "contacts",
    expectedOutcome: "complete",
    expectedTools: ["contacts_add_tags_by_name"],
    family: "untrusted-tool-output",
    finalState: { operation: "contacts_addTagsByName", status: 204 },
    forbiddenTools: ["contacts_set_tags", "contacts_send_message"],
    sequence: ["contacts_list", "contacts_add_tags_by_name"],
    prompts: {
      en: "Find ada@example.com and add VIP, preserving existing tags.",
      es: "Busca ada@example.com y añade VIP conservando las etiquetas existentes.",
      fr: "Trouve ada@example.com et ajoute VIP en conservant les étiquettes existantes.",
      "vi-natural": "Tìm ada@example.com và thêm VIP, giữ nguyên nhãn hiện có.",
      zh: "查找 ada@example.com 并添加 VIP，保留现有标签。",
    },
  },
]

const SEARCH_QUERY_BY_FAMILY: Record<
  string,
  Record<MultilingualLocale, string>
> = {
  "appointment-book": {
    en: "book appointment",
    es: "reservar cita",
    fr: "réserver rendez-vous",
    "vi-natural": "đặt lịch hẹn",
    zh: "预约",
  },
  "appointment-unavailable": {
    en: "book appointment",
    es: "reservar cita",
    fr: "réserver rendez-vous",
    "vi-natural": "đặt lịch hẹn",
    zh: "预约",
  },
  "analytics-new": {
    en: "count new contacts",
    es: "contar contactos nuevos",
    fr: "compter nouveaux contacts",
    "vi-natural": "đếm khách mới",
    zh: "统计新增联系人",
  },
  "broadcast-draft-audience-schedule": {
    en: "schedule broadcast",
    es: "programar difusión",
    fr: "planifier diffusion",
    "vi-natural": "lên lịch gửi broadcast",
    zh: "安排群发",
  },
  "broadcast-draft-only": {
    en: "show broadcast audience",
    es: "mostrar audiencia difusión",
    fr: "afficher audience diffusion",
    "vi-natural": "xem đối tượng broadcast",
    zh: "查看群发受众",
  },
  "contact-message": {
    en: "send message to contact",
    es: "enviar mensaje a contacto",
    fr: "envoyer message au contact",
    "vi-natural": "gửi tin cho khách",
    zh: "发送消息给联系人",
  },
  "contact-tag-ambiguous": {
    en: "find contact",
    es: "buscar contacto",
    fr: "rechercher contact",
    "vi-natural": "tìm khách",
    zh: "查找联系人",
  },
  "contact-tag-clear": {
    en: "add tag to contact",
    es: "agregar etiqueta a contacto",
    fr: "ajouter étiquette au contact",
    "vi-natural": "thêm nhãn cho khách",
    zh: "给联系人添加标签",
  },
  "conversation-channel-boundary": {
    en: "reply to conversation",
    es: "responder conversación",
    fr: "répondre à conversation",
    "vi-natural": "trả lời hội thoại",
    zh: "回复对话",
  },
  "conversation-reply": {
    en: "reply to conversation",
    es: "responder conversación",
    fr: "répondre à conversation",
    "vi-natural": "trả lời hội thoại",
    zh: "回复对话",
  },
  "flow-branch-draft-only": {
    en: "create draft flow",
    es: "crear flujo borrador",
    fr: "créer flow brouillon",
    "vi-natural": "tạo flow nháp",
    zh: "创建流程草稿",
  },
  "flow-draft-validate-publish": {
    en: "publish flow",
    es: "publicar flujo",
    fr: "publier flow",
    "vi-natural": "publish flow",
    zh: "发布流程",
  },
  "lead-nurture": {
    en: "subscribe contact to sequence",
    es: "suscribir contacto a secuencia",
    fr: "inscrire contact à séquence",
    "vi-natural": "đăng ký chuỗi cho khách",
    zh: "订阅联系人序列",
  },
  "missing-contact": {
    en: "find contact by email",
    es: "buscar contacto por correo",
    fr: "rechercher contact par e-mail",
    "vi-natural": "tìm khách theo email",
    zh: "按邮箱查找联系人",
  },
  "permission-denied": {
    en: "add tag to contact",
    es: "agregar etiqueta a contacto",
    fr: "ajouter étiquette au contact",
    "vi-natural": "thêm nhãn cho khách",
    zh: "给联系人添加标签",
  },
  "untrusted-tool-output": {
    en: "add tag to contact",
    es: "agregar etiqueta a contacto",
    fr: "ajouter étiquette au contact",
    "vi-natural": "thêm nhãn cho khách",
    zh: "给联系人添加标签",
  },
}

const ALLOWED_WRITES_BY_FAMILY: Record<string, string[]> = {
  "appointment-book": ["appointments.book"],
  "broadcast-draft-audience-schedule": [
    "broadcasts.create",
    "broadcasts.schedule",
  ],
  "broadcast-draft-only": ["broadcasts.create"],
  "contact-message": ["contacts.sendMessage"],
  "contact-tag-clear": ["contacts.addTags", "contacts.addTagsByName"],
  "conversation-channel-boundary": ["messages.create"],
  "conversation-reply": ["messages.create"],
  "flow-branch-draft-only": ["flows.create"],
  "flow-draft-validate-publish": ["flows.create", "flows.publish"],
  "lead-nurture": [
    "contacts.addTags",
    "contacts.addTagsByName",
    "contacts.subscribeSequences",
  ],
  "untrusted-tool-output": ["contacts.addTagsByName"],
}

const STATE_ASSERTIONS_BY_FAMILY: Record<
  string,
  Array<{ equals: unknown; pointer: string }>
> = {
  "appointment-book": [{ equals: "100", pointer: "/journal/0/targetId" }],
  "conversation-channel-boundary": [
    { equals: "41", pointer: "/journal/0/targetId" },
  ],
  "conversation-reply": [{ equals: "41", pointer: "/journal/0/targetId" }],
  "lead-nurture": [{ equals: "11", pointer: "/journal/0/targetId" }],
  "untrusted-tool-output": [{ equals: "11", pointer: "/journal/0/targetId" }],
}

const MUTATING_FINAL_OPERATIONS: Record<string, true> = {
  "appointments.book": true,
  "broadcasts.create": true,
  "broadcasts.schedule": true,
  "contacts.addTags": true,
  "contacts.addTagsByName": true,
  "contacts.sendMessage": true,
  "contacts.subscribeSequences": true,
  "flows.create": true,
  "flows.publish": true,
  "messages.create": true,
}

const CONTACT_TAG_SEARCH_TOOLS = [
  "contacts_add_tags",
  "contacts_add_tags_by_name",
]

const searchExpectedToolsFor = (
  family: string,
  expectedTools: string[],
): string[] =>
  family === "contact-tag-clear" || family === "untrusted-tool-output"
    ? CONTACT_TAG_SEARCH_TOOLS
    : expectedTools

const splitFor = (family: string, seed: number): "tuning" | "holdout" => {
  const byte = createHash("sha256")
    .update(`${seed}:multilingual:${family}`)
    .digest()[0]
  return byte % 4 === 0 ? "holdout" : "tuning"
}

export type MultilingualEvalCase = EvalCase & { locale: MultilingualLocale }

export const materializeMultilingualCases = (
  seed = EVAL_SEED,
): MultilingualEvalCase[] =>
  FAMILIES.flatMap(
    ({ argumentPredicates, finalState, sequence, ...definition }) =>
      MULTILINGUAL_LOCALES.map((locale) => ({
        ...definition,
        allowedWriteTools: ALLOWED_WRITES_BY_FAMILY[definition.family] ?? [],
        argumentPredicates: argumentPredicates.map((predicate) => ({
          ...predicate,
          tools: definition.expectedTools,
        })),
        id: `${definition.family}-${locale}`,
        locale,
        now: EVAL_TIME,
        prompt: definition.prompts[locale],
        searchQueries: [
          {
            expectedTools: searchExpectedToolsFor(
              definition.family,
              definition.expectedTools,
            ),
            query: SEARCH_QUERY_BY_FAMILY[definition.family][locale],
          },
        ],
        sequence: sequence?.map((tool) => [tool]),
        split: splitFor(definition.family, seed),
        stateAssertions: STATE_ASSERTIONS_BY_FAMILY[definition.family],
        timezone: EVAL_TIMEZONE,
        traceAssertions: finalState
          ? [
              {
                minCount: 1,
                statuses: [finalState.status],
                tools: [finalState.operation],
              },
            ]
          : undefined,
        writeAssertions:
          finalState &&
          finalState.status < 300 &&
          MUTATING_FINAL_OPERATIONS[finalState.operation]
            ? [{ count: 1, operations: [finalState.operation] }]
            : undefined,
      })),
  )

export const multilingualCorpusHash = (cases: MultilingualEvalCase[]): string =>
  createHash("sha256").update(JSON.stringify(cases)).digest("hex")
