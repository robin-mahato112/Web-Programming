/**
 * Render the catalogue's category, price and availability controls.
 * Filter values belong to Products, so every control reports changes through the
 * same callback and the results stay synchronized. Categories and their counts
 * come from the full catalogue, while open only affects the mobile presentation.
 *
 * @param {object} props - Catalogue data, current selections and parent callbacks.
 * @param {object[]} props.products - Complete catalogue used for categories and counts.
 * @param {object} props.filters - Selected category, maximum price and in-stock flag.
 * @param {boolean} props.open - Whether mobile filters are expanded.
 * @param {boolean} props.hasFilters - Whether a reset action should be shown.
 * @param {number} props.priceLimit - Catalogue-wide maximum so expensive products are not hidden by default.
 * @param {function(string, *): void} props.onChange - Receives a filter name and its new value.
 * @param {function(): void} props.onReset - Restores default filters while preserving sort order.
 */
export default function CatalogueFilters({
  products,
  filters,
  priceLimit,
  open,
  hasFilters,
  onChange,
  onReset,
}) {
  const { category, maxPrice, inStockOnly } = filters
  const categories = ['All', ...new Set(products.map((product) => product.category))]
  return (
    <aside
      id="catalogue-filters"
      className={`filter-panel${open ? ' filter-panel--open' : ''}`}
      aria-label="Catalogue filters"
    >
      <h3>Browse categories</h3>
      <div className="category-list">
        {categories.map((item) => (
          <button
            key={item}
            className={category === item ? 'category-button active' : 'category-button'}
            aria-pressed={category === item}
            onClick={() => onChange('category', item)}
            type="button"
          >
            <span>{item === 'All' ? 'Everything' : item}</span>
            <span>
              {products
                .filter((product) => item === 'All' || product.category === item)
                .length.toString()
                .padStart(2, '0')}
            </span>
          </button>
        ))}
      </div>
      <div className="filter-group">
        <label htmlFor="max-price">
          Price up to <strong>${maxPrice}</strong>
        </label>
        <input
          id="max-price"
          type="range"
          min="0"
          max={priceLimit}
          step="1"
          value={maxPrice}
          onChange={(event) => onChange('maxPrice', Number(event.target.value))}
        />
        <div className="range-labels">
          <span>$0</span>
          <span>${priceLimit}</span>
        </div>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={inStockOnly}
          onChange={(event) => onChange('inStockOnly', event.target.checked)}
        />{' '}
        In stock only
      </label>
      {hasFilters && (
        <button className="text-button" onClick={onReset} type="button">
          Reset filters
        </button>
      )}
      <div className="filter-note">
        <span aria-hidden="true">✳</span>
        <strong>A good find awaits.</strong>
        <p>
          A small collection.
          <br />A whole lot to get into.
        </p>
      </div>
    </aside>
  )
}
