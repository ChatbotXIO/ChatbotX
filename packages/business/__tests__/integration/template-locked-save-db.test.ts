// @vitest-environment node

/**
 * Saving a View-only copy against a real Postgres. A full-form save rewrites
 * a product's variants, options and addons on every save, so the edit guard
 * must decide on what was actually stored, not on what the form sent: an
 * installer-owned change (rank, stock) on a locked copy saves, while a change
 * of locked content is refused and rolled back with everything else.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  appointmentCalendarRepository,
  templateInstallationRepository,
} from "@chatbotx.io/database/repositories"
import {
  templateInstalledResourceModel,
  templateModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterEach, describe, expect, test } from "vitest"
import { appointmentCalendarService } from "../../src/appointment-calendar/service"
import { productService } from "../../src/product/service"

const realDatabaseUrl = (): string | null => {
  const url = process.env.DATABASE_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === "1" ? null : url
  } catch {
    return null
  }
}

const databaseUrl = realDatabaseUrl()
const permissions = { allowEdit: false, allowDelete: true }

const content = {
  name: "Shirt",
  shortDescription: null,
  price: 10,
  images: [{ mode: "link" as const, url: "https://example.test/a.png" }],
  variantOptions: [{ name: "Size", values: ["S", "M"], position: 0 }],
  variants: [
    { combination: { Size: "S" }, price: 10, isEnabled: true },
    { combination: { Size: "M" }, price: 12, isEnabled: true },
  ],
  addons: [],
}

describe.skipIf(!databaseUrl)("saving a View-only copy", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  /** A workspace with one completed installation of a View-only template. */
  const seedInstallation = async () => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `tpl-locked-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `tpl-locked-${suffix}`, ownerId: owner.id })
      .returning({ id: workspaceModel.id })
    created.push({ workspaceId: workspace.id, userId: owner.id })
    const [template] = await db
      .insert(templateModel)
      .values({
        workspaceId: workspace.id,
        tenantId: "1",
        name: "Template",
        selection: { mode: "all" } as never,
        payload: {} as never,
        categoryCounts: {},
        formatVersion: 1,
        shareToken: `tok-${suffix}`,
        defaultPermissions: permissions,
      })
      .returning({ id: templateModel.id })
    const installation = await templateInstallationRepository.create({
      workspaceId: workspace.id,
      templateId: template.id,
      sourceTemplateId: template.id,
      templateName: "Template",
      sourceWorkspaceId: workspace.id,
      formatVersion: 1,
      status: "completed",
      permissions,
      sourceVersion: 1,
    })
    return {
      workspaceId: workspace.id,
      installationId: installation.id,
      suffix,
    }
  }

  /** A product installed from a template whose items are View only. */
  const seedLockedProduct = async () => {
    const { workspaceId, installationId, suffix } = await seedInstallation()
    const product = await productService.createFull({
      workspaceId,
      ...content,
    })
    await db.insert(templateInstalledResourceModel).values({
      installationId,
      workspaceId,
      category: "products",
      resourceKind: "product",
      resourceId: product.id,
      sourceResourceId: `src-${suffix}`,
      allowEdit: false,
      allowDelete: true,
    })
    return { workspaceId, productId: product.id }
  }

  /** A calendar installed View only; the form's input as the builder builds it. */
  const seedLockedCalendar = async () => {
    const { workspaceId, installationId, suffix } = await seedInstallation()
    const id = await appointmentCalendarService.create({
      workspaceId,
      name: `Calendar ${suffix}`,
    })
    await db.insert(templateInstalledResourceModel).values({
      installationId,
      workspaceId,
      category: "calendars",
      resourceKind: "calendar",
      resourceId: id,
      sourceResourceId: `src-cal-${suffix}`,
      allowEdit: false,
      allowDelete: true,
    })
    const stored = await appointmentCalendarRepository.getForEdit({
      workspaceId,
      id,
    })
    if (!stored) {
      throw new Error("calendar not created")
    }
    // What the edit form submits: "" for every empty text, child rows
    // without ids, the stored event templates as they are.
    const form = {
      workspaceId,
      id,
      name: stored.name,
      description: stored.description ?? "",
      active: stored.active,
      timezone: stored.timezone,
      durationMinutes: stored.durationMinutes,
      bufferAfterMinutes: stored.bufferAfterMinutes,
      locationType: stored.locationType,
      locationDetail: stored.locationDetail ?? "",
      scheduleWindowType: stored.scheduleWindowType,
      scheduleWindowConfig: stored.scheduleWindowConfig as never,
      maxAppointmentsPerUser: stored.maxAppointmentsPerUser,
      dailyLimitEnabled: stored.dailyLimitEnabled,
      maxPerDay: stored.maxPerDay,
      allowGroupMeeting: stored.allowGroupMeeting,
      maxPerSlot: stored.maxPerSlot,
      confirmationMessage: stored.confirmationMessage ?? "",
      confirmationFlowId: stored.confirmationFlowId,
      cancellationFlowId: stored.cancellationFlowId,
      externalConnectionId: stored.externalConnectionId,
      externalEventTitleTemplate: stored.externalEventTitleTemplate,
      externalEventDescriptionTemplate: stored.externalEventDescriptionTemplate,
      externalEventAttendeesTemplate: stored.externalEventAttendeesTemplate,
      availability: stored.availability.map((row) => ({
        weekday: row.weekday,
        startMinute: row.startMinute,
        endMinute: row.endMinute,
      })),
      reminders: stored.reminders.map((row) => ({
        flowId: row.flowId,
        timingValue: row.timingValue,
        timingUnit: row.timingUnit,
      })),
    }
    return { id, form }
  }

  test("a locked calendar's full form with only `active` flipped saves", async () => {
    const { id, form } = await seedLockedCalendar()

    await appointmentCalendarService.update({ ...form, active: !form.active })

    const stored = await db.query.appointmentCalendarModel.findFirst({
      where: { id },
      columns: { active: true },
    })
    expect(stored?.active).toBe(!form.active)
  })

  test('an emptied event template is a locked change: "" invites nobody, null invites the contact', async () => {
    const { form } = await seedLockedCalendar()

    await expect(
      appointmentCalendarService.update({
        ...form,
        externalEventAttendeesTemplate: "",
      }),
    ).rejects.toMatchObject({ code: "templateAllowEditViolation" })
  })

  test("the full form with only rank and stock changed saves", async () => {
    const { workspaceId, productId } = await seedLockedProduct()

    await productService.updateFull({
      workspaceId,
      productId,
      ...content,
      rank: 3,
      inventoryQuantity: 42,
    })

    const stored = await db.query.productModel.findFirst({
      where: { id: productId },
      columns: { rank: true, inventoryQuantity: true, name: true },
    })
    expect(stored).toEqual({ rank: 3, inventoryQuantity: 42, name: "Shirt" })
  })

  test("a change of locked content is refused and nothing of the save sticks", async () => {
    const { workspaceId, productId } = await seedLockedProduct()

    await expect(
      productService.updateFull({
        workspaceId,
        productId,
        ...content,
        rank: 3,
        variants: [{ combination: { Size: "S" }, price: 99, isEnabled: true }],
      }),
    ).rejects.toMatchObject({ code: "templateAllowEditViolation" })

    const stored = await db.query.productModel.findFirst({
      where: { id: productId },
      columns: { rank: true },
      with: { variants: { columns: { price: true } } },
    })
    // Rolled back whole: the installer-owned rank did not stick either.
    expect(stored?.rank).toBe(10)
    expect(stored?.variants.map((variant) => variant.price).sort()).toEqual([
      10, 12,
    ])
  })

  test("an unlocked copy saves a content change", async () => {
    const { workspaceId, productId } = await seedLockedProduct()
    await db
      .update(templateInstalledResourceModel)
      .set({ allowEdit: true })
      .where(eq(templateInstalledResourceModel.resourceId, productId))

    await productService.updateFull({
      workspaceId,
      productId,
      ...content,
      name: "Renamed",
    })

    const stored = await db.query.productModel.findFirst({
      where: { id: productId },
      columns: { name: true },
    })
    expect(stored?.name).toBe("Renamed")
  })
})
