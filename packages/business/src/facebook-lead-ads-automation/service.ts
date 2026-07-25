import {
  and,
  db,
  eq,
  inArray,
  relationsFilterToSQL,
  sql,
} from "@chatbotx.io/database/client"
import {
  ALL_FORMS_ID,
  type FacebookLeadFieldMappings,
} from "@chatbotx.io/database/partials"
import {
  facebookLeadAdsAutomationModel,
  facebookLeadAdsLeadModel,
} from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

type ListInput = {
  workspaceId: string
  page?: number
  perPage: number
  keyword?: string | null
  sort?: { id: string; desc: boolean }[]
}

type CreateInput = {
  workspaceId: string
  name: string
  pageId: string
  pageName?: string | null
  formId: string
  formName?: string | null
  fieldMapping: FacebookLeadFieldMappings
  flowId?: string | null
}

type UpdateInput = Partial<
  Pick<CreateInput, "name" | "fieldMapping" | "flowId">
>

class FacebookLeadAdsAutomationService extends BaseService {
  async list(input: ListInput) {
    const where = {
      workspaceId: input.workspaceId,
      ...(input.keyword
        ? { name: { ilike: likeContains(input.keyword) } }
        : {}),
    }
    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderByAsObject(facebookLeadAdsAutomationModel, input)

    const [data, totalRows] = await Promise.all([
      db.query.facebookLeadAdsAutomationModel.findMany({
        where,
        orderBy,
        ...pagination,
        with: { flow: true },
      }),
      db.$count(
        facebookLeadAdsAutomationModel,
        relationsFilterToSQL(facebookLeadAdsAutomationModel, where),
      ),
    ])

    const pageCount = Math.ceil(totalRows / input.perPage)
    return { data, pageCount }
  }

  findById(props: { workspaceId: string; id: string }) {
    return db.query.facebookLeadAdsAutomationModel.findFirst({
      where: { id: props.id, workspaceId: props.workspaceId },
      with: { flow: true },
    })
  }

  /**
   * Resolve the automation that should handle a lead for (workspace, page,
   * form). A form-specific automation wins over an "all forms" (`*`) one so the
   * more specific field mapping applies.
   */
  async findMatching(props: {
    workspaceId: string
    pageId: string
    formId: string
  }) {
    const rows = await db.query.facebookLeadAdsAutomationModel.findMany({
      where: {
        workspaceId: props.workspaceId,
        pageId: props.pageId,
        formId: { in: [props.formId, ALL_FORMS_ID] },
      },
    })
    return (
      rows.find((row) => row.formId === props.formId) ??
      rows.find((row) => row.formId === ALL_FORMS_ID)
    )
  }

  async create(input: CreateInput) {
    const [row] = await db
      .insert(facebookLeadAdsAutomationModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        name: input.name,
        pageId: input.pageId,
        pageName: input.pageName ?? null,
        formId: input.formId,
        formName: input.formName ?? null,
        fieldMapping: input.fieldMapping,
        flowId: input.flowId ?? null,
      })
      .returning()
    return row
  }

  async update(props: { workspaceId: string; id: string }, input: UpdateInput) {
    const [row] = await db
      .update(facebookLeadAdsAutomationModel)
      .set(input)
      .where(
        and(
          eq(facebookLeadAdsAutomationModel.id, props.id),
          eq(facebookLeadAdsAutomationModel.workspaceId, props.workspaceId),
        ),
      )
      .returning()
    return row
  }

  async deleteMany(props: { workspaceId: string; ids: string[] }) {
    await db
      .delete(facebookLeadAdsAutomationModel)
      .where(
        and(
          eq(facebookLeadAdsAutomationModel.workspaceId, props.workspaceId),
          inArray(facebookLeadAdsAutomationModel.id, props.ids),
        ),
      )
  }

  async incrementLeadsHandled(id: string) {
    await db
      .update(facebookLeadAdsAutomationModel)
      .set({
        leadsHandledCount: sql`${facebookLeadAdsAutomationModel.leadsHandledCount} + 1`,
      })
      .where(eq(facebookLeadAdsAutomationModel.id, id))
  }
}

export const facebookLeadAdsAutomationService =
  new FacebookLeadAdsAutomationService()

class FacebookLeadAdsLeadService extends BaseService {
  /**
   * Claim a (automation, leadgen) pair for processing. Returns the new row only
   * for the first caller — Facebook re-delivers leadgen webhooks, and the
   * unique index makes concurrent/retry claims a no-op via onConflictDoNothing.
   */
  async claim(props: {
    automationId: string
    leadgenId: string
  }): Promise<{ id: string } | null> {
    const [row] = await db
      .insert(facebookLeadAdsLeadModel)
      .values({
        id: createId(),
        automationId: props.automationId,
        leadgenId: props.leadgenId,
      })
      .onConflictDoNothing()
      .returning({ id: facebookLeadAdsLeadModel.id })
    return row ?? null
  }

  /**
   * Drop a claim so a retry can reprocess the lead. Callers must release when
   * the work guarded by `claim` fails — the unique index would otherwise make
   * every retry a silent no-op and the lead would be lost for good.
   */
  async release(props: { id: string }) {
    await db
      .delete(facebookLeadAdsLeadModel)
      .where(eq(facebookLeadAdsLeadModel.id, props.id))
  }

  async setContactId(props: { id: string; contactId: string }) {
    await db
      .update(facebookLeadAdsLeadModel)
      .set({ contactId: props.contactId })
      .where(eq(facebookLeadAdsLeadModel.id, props.id))
  }
}

export const facebookLeadAdsLeadService = new FacebookLeadAdsLeadService()
