import { useState } from 'react'

/** A native form supports both the visible Search button and Enter without per-keystroke requests. */
export default function CatalogueSearch({ query, onSearch }) {
  const [search, setSearch] = useState({ query, draft: query })
  // Sync Back/Forward navigation without remounting the input and losing keyboard focus.
  if (search.query !== query) setSearch({ query, draft: query })
  return (
    <form
      className="catalogue-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        onSearch(search.draft.trim())
      }}
    >
      <label className="search-field">
        <span aria-hidden="true">⌕</span>
        <span className="sr-only">Search the catalogue</span>
        <input
          type="search"
          name="q"
          maxLength={200}
          placeholder="Search games, books, movies…"
          value={search.draft}
          onChange={(event) => setSearch({ query, draft: event.target.value })}
        />
      </label>
      <button className="button button--dark" type="submit">
        Search
      </button>
    </form>
  )
}
