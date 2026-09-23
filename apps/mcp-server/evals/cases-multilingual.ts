import { createHash } from "node:crypto"
import { EVAL_SEED, EVAL_TIME, EVAL_TIMEZONE, type EvalCase } from "./cases"

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
 * variants, which were written to already fit the synonym table. `es` and
 * `zh` probe the Latin-vs-non-Latin-script branch in
 * `containsNonLatinScript` (see `src/server/search/normalize.ts`): Spanish
 * is Latin script like Vietnamese and gets no "translate" hint either,
 * while Chinese is flagged. `fr` has zero entries in
 * `src/server/search/synonyms.ts` and exists to prove a new language needs
 * no code change: it goes through the exact same translate-first /
 * script-detection path as `es`, with no French alias added anywhere.
 */
export type MultilingualLocale = "en" | "vi-natural" | "es" | "zh" | "fr"

const MULTILINGUAL_LOCALES: readonly MultilingualLocale[] = [
  "en",
  "vi-natural",
  "es",
  "zh",
  "fr",
]

type MultilingualFamilySource = Pick<
  EvalCase,
  | "argumentPredicates"
  | "domain"
  | "expectedOutcome"
  | "expectedTools"
  | "family"
  | "forbiddenTools"
> & { prompts: Record<MultilingualLocale, string> }

/**
 * Each family name matches an existing family in `cases.ts` so results are
 * directly comparable against that corpus's `en`/`vi` rows. Prompts are
 * realistic short chat requests -- natural punctuation, polite particles,
 * no attempt to pre-fit the synonym table -- reviewed for correctness by a
 * Vietnamese speaker (`vi-natural`) rather than machine-translated only.
 */
const FAMILIES: MultilingualFamilySource[] = [
  {
    argumentPredicates: [{ key: "identifier", includes: "email:" }],
    domain: "contacts",
    expectedOutcome: "complete",
    expectedTools: ["contacts_get"],
    family: "contact-email-get",
    forbiddenTools: ["contacts_search", "contacts_find_by_custom_field"],
    prompts: {
      en: "Can you pull up the customer with email ada@example.com?",
      es: "¿Puedes buscar al cliente con el correo ada@example.com?",
      fr: "Peux-tu retrouver le client avec l'email ada@example.com ?",
      "vi-natural": "Cho mình xem thông tin khách ada@example.com với ạ?",
      zh: "帮我查一下邮箱是 ada@example.com 的客户，谢谢。",
    },
  },
  {
    argumentPredicates: [],
    domain: "contacts",
    expectedOutcome: "complete",
    expectedTools: ["contacts_list"],
    family: "contact-name-get",
    forbiddenTools: ["contacts_search", "contacts_find_by_custom_field"],
    prompts: {
      en: "Can you find the contact named An for me?",
      es: "¿Puedes buscar el contacto llamado An, por favor?",
      fr: "Peux-tu retrouver le contact nommé An, s'il te plaît ?",
      "vi-natural": "Cho mình xem thông tin khách An với ạ",
      zh: "麻烦帮我找一下叫 An 的这位客户。",
    },
  },
  {
    argumentPredicates: [],
    domain: "tags",
    expectedOutcome: "complete",
    expectedTools: ["tags_create"],
    family: "tag-create",
    forbiddenTools: ["contacts_set_tags"],
    prompts: {
      en: "Please create a new tag called VIP.",
      es: "Por favor crea una nueva etiqueta llamada VIP.",
      fr: "Peux-tu créer une nouvelle étiquette appelée VIP ?",
      "vi-natural": "Bạn tạo giúp mình cái nhãn VIP nhé, cảm ơn!",
      zh: "麻烦帮我创建一个叫 VIP 的标签。",
    },
  },
  {
    argumentPredicates: [
      { key: "identifier", includes: "id:" },
      { key: "tags", includes: "VIP" },
    ],
    domain: "tags",
    expectedOutcome: "complete",
    expectedTools: ["contacts_add_tags_by_name"],
    family: "contact-tag-add",
    forbiddenTools: ["contacts_set_tags"],
    prompts: {
      en: "Could you add the VIP tag to An, please?",
      es: "¿Podrías agregarle la etiqueta VIP a An, por favor?",
      fr: "Pourrais-tu ajouter l'étiquette VIP à An, s'il te plaît ?",
      "vi-natural": "Gắn giúp mình nhãn VIP cho khách An với, cảm ơn bạn!",
      zh: "能不能帮我给 An 打上 VIP 标签？",
    },
  },
  {
    argumentPredicates: [
      { includes: "email:", key: "identifier" },
      { includes: "hello", key: "text" },
    ],
    domain: "messages",
    expectedOutcome: "complete",
    expectedTools: ["contacts_send_message"],
    family: "contact-email-send",
    forbiddenTools: ["contacts_trigger_auto_reply", "broadcasts_create"],
    prompts: {
      en: "Send a quick hello to ada@example.com for me.",
      es: "Envíale un hello rápido a ada@example.com, por favor.",
      fr: "Envoie un petit hello à ada@example.com pour moi.",
      "vi-natural": "Nhắn giúp mình chữ hello cho ada@example.com nhé",
      zh: "帮我给 ada@example.com 发一条 hello 的消息吧。",
    },
  },
  {
    argumentPredicates: [{ key: "conversationId" }],
    domain: "messages",
    expectedOutcome: "complete",
    expectedTools: ["messages_create"],
    family: "conversation-reply",
    forbiddenTools: ["contacts_send_message", "broadcasts_create"],
    prompts: {
      en: "Reply to conversation 41 and say we've received it.",
      es: "Responde en la conversación 41 diciendo que ya lo recibimos.",
      fr: "Réponds dans la conversation 41 pour dire qu'on l'a bien reçu.",
      "vi-natural": "Bạn trả lời giúp hội thoại 41 là mình đã nhận rồi nha",
      zh: "麻烦回复一下第 41 号对话，说我们已经收到了。",
    },
  },
  {
    argumentPredicates: [],
    domain: "broadcasts",
    expectedOutcome: "complete",
    expectedTools: ["broadcasts_create"],
    family: "broadcast-draft",
    forbiddenTools: ["broadcasts_schedule", "broadcasts_send"],
    prompts: {
      en: "Could you draft a broadcast greeting our VIP customers?",
      es: "¿Podrías crear un borrador de difusión para saludar a los VIP?",
      fr: "Pourrais-tu préparer un brouillon de diffusion pour saluer nos clients VIP ?",
      "vi-natural": "Bạn tạo giúp mình bản nháp broadcast chào khách VIP nhé",
      zh: "帮我起草一条给 VIP 客户的群发问候消息吧。",
    },
  },
  {
    argumentPredicates: [],
    domain: "flows",
    expectedOutcome: "complete",
    expectedTools: ["flows_create"],
    family: "flow-create",
    forbiddenTools: ["flows_publish"],
    prompts: {
      en: "Can you create a simple welcome flow for new customers?",
      es: "¿Puedes crear un flujo de bienvenida sencillo para clientes nuevos?",
      fr: "Peux-tu créer un flow de bienvenue simple pour les nouveaux clients ?",
      "vi-natural": "Bạn tạo giúp mình một cái flow chào mừng đơn giản nha",
      zh: "帮我创建一个简单的新客户欢迎流程吧。",
    },
  },
  {
    argumentPredicates: [
      { includes: "id:", key: "identifier" },
      { key: "sequenceIds" },
    ],
    domain: "sequences",
    expectedOutcome: "complete",
    expectedTools: ["contacts_subscribe_sequences"],
    family: "sequence-subscribe",
    forbiddenTools: ["sequences_delete"],
    prompts: {
      en: "Please subscribe Ada to the nurture sequence.",
      es: "Por favor suscribe a Ada a la secuencia de nutrición.",
      fr: "Peux-tu abonner Ada à la séquence de fidélisation ?",
      "vi-natural":
        "Cho mình đăng ký giúp Ada vào chuỗi chăm sóc khách hàng với",
      zh: "麻烦帮我把 Ada 加入到那个培育序列里。",
    },
  },
  {
    argumentPredicates: [],
    domain: "products",
    expectedOutcome: "complete",
    expectedTools: ["products_list"],
    family: "product-list",
    forbiddenTools: ["products_create"],
    prompts: {
      en: "Can you list out our products?",
      es: "¿Puedes mostrarme la lista de productos?",
      fr: "Peux-tu me montrer la liste des produits ?",
      "vi-natural": "Cho mình xem danh sách sản phẩm với ạ",
      zh: "麻烦给我看一下产品列表。",
    },
  },
  {
    argumentPredicates: [],
    domain: "coupons",
    expectedOutcome: "complete",
    expectedTools: ["coupons_list_coupons"],
    family: "coupon-list",
    forbiddenTools: ["coupons_list_topics"],
    prompts: {
      en: "Show me the coupons that have already been issued.",
      es: "Muéstrame los cupones que ya se han emitido.",
      fr: "Montre-moi les coupons qui ont déjà été émis.",
      "vi-natural": "Cho mình xem những mã coupon đã cấp rồi ạ",
      zh: "帮我看看已经发放的优惠券有哪些。",
    },
  },
  {
    argumentPredicates: [{ key: "tab", value: "next" }],
    domain: "appointments",
    expectedOutcome: "complete",
    expectedTools: ["appointments_list"],
    family: "appointment-next",
    forbiddenTools: ["appointments_cancel"],
    prompts: {
      en: "What appointments are coming up next?",
      es: "¿Qué citas tenemos próximamente?",
      fr: "Quels sont les prochains rendez-vous à venir ?",
      "vi-natural": "Cho mình xem lịch hẹn sắp tới với",
      zh: "帮我看看接下来有哪些预约。",
    },
  },
  {
    argumentPredicates: [],
    domain: "appointments",
    expectedOutcome: "complete",
    expectedTools: ["appointments_cancel"],
    family: "appointment-cancel",
    forbiddenTools: ["appointments_delete"],
    prompts: {
      en: "Please cancel appointment 99.",
      es: "Por favor cancela la cita número 99.",
      fr: "Peux-tu annuler le rendez-vous 99, s'il te plaît ?",
      "vi-natural": "Bạn hủy giúp mình lịch hẹn 99 nhé",
      zh: "麻烦帮我取消第 99 号预约。",
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
    forbiddenTools: ["analytics_contacts_count"],
    prompts: {
      en: "How many new contacts did we get today?",
      es: "¿Cuántos contactos nuevos tuvimos hoy?",
      fr: "Combien de nouveaux contacts avons-nous eus aujourd'hui ?",
      "vi-natural": "Hôm nay có bao nhiêu khách mới vậy bạn?",
      zh: "今天新增了多少客户呀？",
    },
  },
  {
    argumentPredicates: [],
    domain: "contacts",
    expectedOutcome: "clarify",
    expectedTools: ["contacts_list"],
    family: "contact-name-ambiguous",
    forbiddenTools: [
      "contacts_update",
      "contacts_send_message",
      "contacts_delete",
    ],
    prompts: {
      en: "Send a message to An.",
      es: "Envíale un mensaje a An.",
      fr: "Envoie un message à An.",
      "vi-natural": "Bạn nhắn giúp mình cho khách An với",
      zh: "帮我给 An 发条消息吧。",
    },
  },
]

const splitFor = (
  family: string,
  locale: MultilingualLocale,
): "tuning" | "holdout" => {
  const byte = createHash("sha256")
    .update(`${EVAL_SEED}:multilingual:${family}:${locale}`)
    .digest()[0]
  return byte % 4 === 0 ? "holdout" : "tuning"
}

export type MultilingualEvalCase = EvalCase & { locale: MultilingualLocale }

export const materializeMultilingualCases = (): MultilingualEvalCase[] =>
  FAMILIES.flatMap((definition) =>
    MULTILINGUAL_LOCALES.map((locale) => ({
      argumentPredicates: definition.argumentPredicates,
      domain: definition.domain,
      expectedOutcome: definition.expectedOutcome,
      expectedTools: definition.expectedTools,
      family: definition.family,
      forbiddenTools: definition.forbiddenTools,
      id: `${definition.family}-${locale}`,
      locale,
      now: EVAL_TIME,
      prompt: definition.prompts[locale],
      split: splitFor(definition.family, locale),
      timezone: EVAL_TIMEZONE,
    })),
  )

export const multilingualCorpusHash = (cases: MultilingualEvalCase[]): string =>
  createHash("sha256").update(JSON.stringify(cases)).digest("hex")
