import z from "zod"

export const inventoryPolicyTypes = z.enum(["dont_track", "track"])
export type InventoryPolicyType = z.infer<typeof inventoryPolicyTypes>
