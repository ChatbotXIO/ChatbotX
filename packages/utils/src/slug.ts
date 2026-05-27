/**
 * Converte string em slug snake_case lowercase (ascii-only).
 * Usado pra gerar fieldId de Custom Fields e similares.
 *
 * Exemplos:
 *   "Plano Contratado" → "plano_contratado"
 *   "Data de Aniversário" → "data_de_aniversario"
 *   "WHO?!" → "who"
 *   "  " → ""
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

/**
 * Garante slug único dentro de uma lista de slugs existentes.
 * Adiciona sufixo _2, _3, etc até achar disponível.
 *
 * Exemplo: slugifyUnique("plano", ["plano", "plano_2"]) → "plano_3"
 */
export function slugifyUnique(
  input: string,
  existingSlugs: Set<string>,
): string {
  const base = slugify(input)
  if (!base) {
    return `field_${Math.random().toString(36).slice(2, 8)}`
  }
  if (!existingSlugs.has(base)) {
    return base
  }
  let counter = 2
  while (existingSlugs.has(`${base}_${counter}`)) {
    counter += 1
  }
  return `${base}_${counter}`
}
