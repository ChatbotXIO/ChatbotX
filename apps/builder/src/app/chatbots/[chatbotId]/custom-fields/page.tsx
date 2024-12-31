import { getTagsSearchParamsCache } from '@/features/tags/schemas/get-tags-schema';
import { type SearchParams } from 'nuqs/server';

export default async function CustomFieldsPage(props: {
  params: Promise<{ chatbotId: string }>,
  searchParams: Promise<SearchParams>
}) {
  const searchParams = await props.searchParams
  const { folderId } = getTagsSearchParamsCache.parse(searchParams)

  return (
    <div>Folder ID: {folderId}</div>
  )
}
