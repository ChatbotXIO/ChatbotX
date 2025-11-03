import type { IGif } from "@giphy/js-types"
import {
  Grid,
  SearchBar,
  SearchContext,
  SearchContextManager,
  SuggestionBar,
} from "@giphy/react-components"
import { type SyntheticEvent, useContext } from "react"

export const GifFinder = ({
  apiKey,
  onSelect,
}: {
  apiKey: string
  onSelect: (gif: IGif, e: SyntheticEvent<HTMLElement, Event>) => void
}) => (
  <SearchContextManager apiKey={apiKey}>
    <GifItemsList onSelect={onSelect} />
  </SearchContextManager>
)

const GifItemsList = ({
  onSelect,
}: {
  onSelect: (gif: IGif, e: SyntheticEvent<HTMLElement, Event>) => void
}) => {
  const { fetchGifs, searchKey } = useContext(SearchContext)
  return (
    <>
      <SearchBar />
      <SuggestionBar />
      <Grid
        columns={3}
        fetchGifs={fetchGifs}
        key={searchKey}
        onGifClick={onSelect}
        width={800}
      />
    </>
  )
}
