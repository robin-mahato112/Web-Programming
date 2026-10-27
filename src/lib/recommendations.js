/** Subgenre IDs are only meaningful within a category (books and games can share IDs).
 * Exclude selected titles and unavailable offers; missing subgenres use the category only. */
export function recommendProducts(products, selected, excludeIds = []) {
  const excluded = new Set([...selected.map((product) => product.id), ...excludeIds])
  return products
    .filter(
      (product) =>
        !excluded.has(product.id) &&
        product.stock > 0 &&
        selected.some(
          (seed) =>
            seed.category === product.category &&
            seed.category !== 'Other' &&
            (!seed.subGenreId || seed.subGenreId === product.subGenreId),
        ),
    )
    .sort((a, b) => a.title.localeCompare(b.title) || Number(a.id) - Number(b.id))
    .slice(0, 4)
}
