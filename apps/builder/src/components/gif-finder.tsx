import { GiphyFetch } from "@giphy/js-fetch-api"
import type { IGif } from "@giphy/js-types"
import { Grid } from "@giphy/react-components"

import { type SyntheticEvent, useEffect, useState } from "react"

export const GifFinder = ({
  apiKey,
  searchQuery,
  searched,
  width,
  height,
  handleGifClick,
}: {
  apiKey: string
  searchQuery: string
  searched: boolean
  width: number
  height: number
  handleGifClick: (gif: IGif, e: SyntheticEvent<HTMLElement, Event>) => void
}) => {
  const [fetched, setFetched] = useState(false)
  const giphyFetch = new GiphyFetch(apiKey)

  function searchGifs() {
    return giphyFetch.search(searchQuery, { limit: 20 })
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
  useEffect(() => {
    setFetched(false)
    if (searched) {
      searchGifs().then(() => {
        setFetched(true)
      })
    }
  }, [searched, searchQuery])
  return searched ? (
    <div className="flex justify-center">
      {fetched ? (
        <Grid
          columns={3}
          fetchGifs={searchGifs}
          gutter={6}
          onGifClick={handleGifClick}
          width={height > width || width < 728 ? width : width / 2}
        />
      ) : (
        <div>Loading...</div>
      )}
    </div>
  ) : null
}
