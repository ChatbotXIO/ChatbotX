import { productRepository } from "@chatbotx.io/database/repositories"
import {
  buttonTypes,
  getChannelFlowPolicy,
  type SendCollectionStepSchema,
  type SendTextStepSchema,
  stepSupport,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { ecommerceSettingsService } from "../ecommerce-settings/service"
import { resolveContactMessageLanguage } from "../order/contact-language"
import type { CustomerMessageLanguage } from "../order/customer-messages"
import { resolveTenantSettings } from "../platform/settings"
import { buildWebshopButtonUrl } from "./link"

/** Product names read for matching; a bigger catalog matches its first ones. */
const SEARCHABLE_NAMES_LIMIT = 2000
const NAMES_CACHE_SECONDS = 60
const MIN_MATCH_LENGTH = 3
/**
 * A message found inside a longer product name must be at least this long,
 * so one short common word ("mua", "giá", "set") does not list every product
 * whose name happens to contain it.
 */
const MIN_PARTIAL_MATCH_LENGTH = 4
export const PRODUCT_SEARCH_MAX_RESULTS = 10

/** Lower case, without punctuation, one space between words; accents kept. */
const normalizeWords = (text: string): string =>
  text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

/**
 * Lower case, without accents (Vietnamese `đ` included) or punctuation, one
 * space between words — so "Áo thun!" and "ao thun" read the same.
 */
export const normalizeForSearch = (text: string): string =>
  normalizeWords(
    text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[đĐ]/g, "d"),
  )

type SearchWord = { text: string; folded: string; accented: boolean }

const toSearchWords = (text: string): SearchWord[] =>
  normalizeWords(text)
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      const folded = normalizeForSearch(word)
      return { text: word, folded, accented: folded !== word }
    })

/**
 * A word the customer typed with accents must match them ("cảm" is not
 * "cam"); one typed without accents matches either ("ao" is "áo").
 */
const isSameWord = (messageWord: SearchWord, nameWord: SearchWord) =>
  messageWord.accented
    ? messageWord.text === nameWord.text
    : messageWord.folded === nameWord.folded

/** Whether `inner` appears as consecutive whole words inside `outer`. */
const containsWordRun = (
  outer: SearchWord[],
  inner: SearchWord[],
  isSame: (outerWord: SearchWord, innerWord: SearchWord) => boolean,
) =>
  inner.length > 0 &&
  outer.some(
    (_, start) =>
      start + inner.length <= outer.length &&
      inner.every((word, offset) => isSame(outer[start + offset], word)),
  )

const foldedLength = (words: SearchWord[]) =>
  words.map((word) => word.folded).join(" ").length

/**
 * The product names a message refers to, best first: the message naming a
 * product ("cho mình xem áo thun" names "Áo thun"), or the message being part
 * of a product's name ("áo thun" finds "Áo thun cotton"). Whole words only,
 * at least 3 characters (4 for part of a name), ignoring case. Accents count
 * only where the customer typed them: "cảm ơn" is not the product "Cam", while
 * "ao thun" finds "Áo thun".
 */
export const matchProductNames = <Product extends { id: string; name: string }>(
  message: string,
  products: readonly Product[],
): Product[] => {
  const messageWords = toSearchWords(message)
  const messageLength = foldedLength(messageWords)
  if (messageLength < MIN_MATCH_LENGTH) {
    return []
  }
  const scored = products.flatMap((product) => {
    const nameWords = toSearchWords(product.name)
    const length = foldedLength(nameWords)
    if (length < MIN_MATCH_LENGTH) {
      return []
    }
    const nameInMessage = containsWordRun(
      messageWords,
      nameWords,
      (messageWord, nameWord) => isSameWord(messageWord, nameWord),
    )
    if (nameInMessage && nameWords.length === messageWords.length) {
      return [{ product, score: 3, length }]
    }
    if (nameInMessage) {
      return [{ product, score: 2, length }]
    }
    if (
      messageLength >= MIN_PARTIAL_MATCH_LENGTH &&
      containsWordRun(nameWords, messageWords, (nameWord, messageWord) =>
        isSameWord(messageWord, nameWord),
      )
    ) {
      return [{ product, score: 1, length }]
    }
    return []
  })
  return scored
    .sort((a, b) => b.score - a.score || b.length - a.length)
    .map(({ product }) => product)
}

/**
 * "Search Products" (a Pro store setting): the products a customer's message
 * names, at most 10, or none when the store has the setting off.
 */
export async function searchProductsByMessage(input: {
  workspaceId: string
  text: string
}): Promise<Array<{ id: string; name: string }>> {
  const settings = await ecommerceSettingsService.get(input.workspaceId)
  if (!(settings.general.searchProducts && input.text.trim())) {
    return []
  }
  const names = await withCache(
    `webshop:searchable-names:${input.workspaceId}`,
    () =>
      productRepository.listSearchableNames({
        workspaceId: input.workspaceId,
        limit: SEARCHABLE_NAMES_LIMIT,
      }),
    { ttl: NAMES_CACHE_SECONDS },
  )
  return matchProductNames(input.text, names).slice(
    0,
    PRODUCT_SEARCH_MAX_RESULTS,
  )
}

const SEARCH_REPLY_STRINGS: Record<
  CustomerMessageLanguage,
  { found: string; view: string }
> = {
  en: { found: "Here is what we found:", view: "View products" },
  vi: { found: "Đây là các sản phẩm phù hợp:", view: "Xem sản phẩm" },
}

/**
 * The bot's answer to a message naming products: a product carousel where the
 * channel shows one (the collection step, resolved when sent), else their
 * names above a button opening the shop on that search. Null when the message
 * names no product or the store has "Search Products" off.
 */
export async function buildProductSearchReply(input: {
  workspaceId: string
  contactId: string
  channel: string
  text: string
}): Promise<SendCollectionStepSchema | SendTextStepSchema | null> {
  const products = await searchProductsByMessage(input)
  if (products.length === 0) {
    return null
  }
  const showsCollection =
    getChannelFlowPolicy(input.channel)?.steps[
      stepTypes.enum.sendCollection
    ] === stepSupport.full
  if (showsCollection) {
    return {
      id: createId(),
      stepType: stepTypes.enum.sendCollection,
      dataType: "products",
      collectionType: "manual",
      conditions: {
        name: "",
        categoryId: null,
        subcategoryId: null,
        vendorId: null,
      },
      productIds: products.map((product) => product.id),
    }
  }
  const [language, { appUrl }] = await Promise.all([
    resolveContactMessageLanguage(input),
    resolveTenantSettings({ workspaceId: input.workspaceId }),
  ])
  const strings = SEARCH_REPLY_STRINGS[language]
  return {
    id: createId(),
    stepType: stepTypes.enum.sendText,
    text: [
      strings.found,
      ...products.map((product) => `• ${product.name}`),
    ].join("\n"),
    buttons: [
      {
        id: createId(),
        label: strings.view,
        buttonType: buttonTypes.enum.openWebsite,
        beforeStep: {
          id: createId(),
          stepType: stepTypes.enum.openWebsite,
          url: buildWebshopButtonUrl({
            appUrl,
            workspaceId: input.workspaceId,
            keyword: input.text.trim().slice(0, 100),
          }),
          browserSize: 100,
        },
        steps: [],
      },
    ],
  }
}
