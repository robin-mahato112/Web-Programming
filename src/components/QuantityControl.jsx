/**
 * Display a quantity owned by the parent and request changes one unit at a time.
 * Buttons stop at the supplied limits, and the announced output keeps keyboard
 * and screen-reader users informed. The cart validates changes separately;
 * disabling a button is a usability measure rather than the stock check itself.
 *
 * @param {object} props - Quantity state and its permitted bounds.
 * @param {number} props.value - Current whole-number quantity between min and max.
 * @param {number} [props.min=1] - Lowest selectable quantity.
 * @param {number} [props.max=Infinity] - Highest selectable quantity.
 * @param {function(number): void} props.onChange - Receives the requested next quantity.
 */
export default function QuantityControl({ value, min = 1, max = Infinity, onChange }) {
  return (
    <div className="quantity-control" aria-label="Quantity">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Decrease quantity"
      >
        -
      </button>
      <output aria-live="polite">{value}</output>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  )
}
