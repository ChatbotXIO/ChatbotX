"use client"

import { FolderOpenIcon, LayoutGridIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { groupCategoriesByParent } from "../lib/category-tree"
import { useShop } from "./shop-provider"

type Category = {
  id: string
  name: string
  imageUrl?: string | null
  parentId?: string | null
}

const CARD_CLASS =
  "group flex flex-col overflow-hidden rounded-md border bg-card shadow-xs transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-primary hover:shadow-md motion-reduce:hover:translate-y-0"

/** One top-level category as a card, its sub-categories as links under it. */
function CategoryCard({
  category,
  subcategories,
}: {
  category: Category
  subcategories: Category[]
}) {
  const shop = useShop()
  return (
    <div className={CARD_CLASS}>
      <Link
        className="flex flex-1 flex-col"
        href={shop.href("", { category: category.id })}
      >
        <div className="flex aspect-square items-center justify-center bg-muted">
          {category.imageUrl ? (
            // biome-ignore lint/performance/noImgElement: merchant images come from any host
            <img
              alt=""
              className="size-full object-cover"
              height={200}
              src={category.imageUrl}
              width={200}
            />
          ) : (
            <FolderOpenIcon className="size-10 text-muted-foreground" />
          )}
        </div>
        <span className="truncate p-2.5 font-medium text-sm group-hover:text-primary">
          {category.name}
        </span>
      </Link>
      {subcategories.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-t px-2.5 py-2">
          {subcategories.map((child) => (
            <Link
              className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs hover:bg-primary/10 hover:text-primary"
              href={shop.href("", { category: child.id })}
              key={child.id}
            >
              {child.name}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** The shop's visible categories; each opens the shop on its products. */
export function CategoryGrid({ categories }: { categories: Category[] }) {
  const t = useTranslations("webshop")
  const shop = useShop()
  const groups = groupCategoriesByParent(categories)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-bold text-xl tracking-tight">{t("categories")}</h1>
        <Link
          className="inline-flex items-center gap-1.5 text-primary text-sm hover:underline"
          href={shop.href()}
        >
          <LayoutGridIcon className="size-4" />
          {t("allProducts")}
        </Link>
      </div>
      {groups.length === 0 ? (
        <p className="rounded-md border bg-card p-8 text-center text-muted-foreground text-sm">
          {t("noCategories")}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {groups.map(({ category, subcategories }) => (
            <CategoryCard
              category={category}
              key={category.id}
              subcategories={subcategories}
            />
          ))}
        </div>
      )}
    </div>
  )
}
