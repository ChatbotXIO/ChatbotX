import { useMemo } from "react"
import { useProductStore } from "./product-store-context"

export const useProductSelectOptions = (): {
  label: string
  value: string
}[] => {
  const products = useProductStore((state) => state.products)

  return useMemo(
    () =>
      products.map((product) => ({ value: product.id, label: product.name })),
    [products],
  )
}
