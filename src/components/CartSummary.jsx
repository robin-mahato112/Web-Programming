/** Display the accepted quote total; the cart page supplies its available actions. */
export default function CartSummary({ subtotal, itemCount, children }) {
  return (
    <aside className="summary-card">
      <h2>Cart summary</h2>
      <p>
        <span>Items</span>
        <strong>{itemCount}</strong>
      </p>
      <hr />
      <p className="summary-total">
        <span>Total (AUD)</span>
        <strong>${subtotal.toFixed(2)}</strong>
      </p>
      {children}
    </aside>
  )
}
