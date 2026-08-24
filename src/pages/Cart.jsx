import { Link } from 'react-router-dom'

export default function Cart() {
  return <section className="section shell"><p className="eyebrow">Customer</p><h1>Your cart</h1><div className="empty-state"><span aria-hidden="true">◫</span><h2>Your cart is ready for an adventure</h2><p>No items have been added in this Sprint 1 prototype.</p><Link className="button button--primary" to="/products">Explore products</Link></div></section>
}
