import { type DatabaseClient, db, sql } from "../../client"
import {
  MINIGAME_IMAGE_URL_PATHS,
  MINIGAME_PRIZE_ICON_PATH,
} from "../../partials/minigame"
import { escapeLikePattern } from "../../utils"

/** A Postgres `text[]` literal for `#>>`, bound as a parameter. */
const pathArray = (path: readonly string[]) => `{${path.join(",")}}`

const fixedPathMatch = (entry: (typeof MINIGAME_IMAGE_URL_PATHS)[number]) =>
  sql`m.${sql.identifier(entry.column)} #>> ${pathArray(entry.path)}::text[] = requested.url`

export const minigameRepository = {
  /** Names in the workspace starting with `prefix` (taken as plain text). */
  async listNamesWithPrefix(
    input: { workspaceId: string; prefix: string },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    const rows = await tx.query.minigameModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        name: { like: `${escapeLikePattern(input.prefix)}%` },
      },
      columns: { name: true },
    })
    return rows.map((row) => row.name)
  },
  /**
   * Which of `urls` an image field of a minigame OTHER than `excludeIds` in the
   * workspace still shows (background, prize description, start button, lose
   * image, prize icons). Bounded: it returns only the matched urls, never the
   * JSON of the other minigames.
   */
  async findImageUrlsUsedByOthers(
    input: { workspaceId: string; excludeIds: string[]; urls: string[] },
    tx: DatabaseClient = db,
  ): Promise<Set<string>> {
    if (input.urls.length === 0) {
      return new Set()
    }
    const urls = sql.join(
      input.urls.map((url) => sql`${url}`),
      sql`, `,
    )
    const excluded = sql.join(
      input.excludeIds.map((id) => sql`${id}::bigint`),
      sql`, `,
    )
    const prizesJson = sql`m.${sql.identifier(MINIGAME_PRIZE_ICON_PATH.column)} -> ${MINIGAME_PRIZE_ICON_PATH.arrayKey}::text`
    const result = await tx.execute<{ url: string }>(
      sql`select requested.url
        from unnest(array[${urls}]::text[]) as requested(url)
        where exists (
          select 1 from "Minigame" m
          where m."workspaceId" = ${input.workspaceId}::bigint
            and m.id <> all(array[${excluded}]::bigint[])
            and (
              ${sql.join(MINIGAME_IMAGE_URL_PATHS.map(fixedPathMatch), sql` or `)}
              or exists (
                select 1
                from jsonb_array_elements(
                  case when jsonb_typeof(${prizesJson}) = 'array'
                    then ${prizesJson} else '[]'::jsonb end
                ) as prize
                where prize #>> ${pathArray(MINIGAME_PRIZE_ICON_PATH.path)}::text[] = requested.url
              )
            )
        )`,
    )
    return new Set(result.rows.map((row) => row.url))
  },
}
