import { Link } from 'react-router-dom'
export default function NotFound() { return <section className="section shell empty-state"><span aria-hidden="true">404</span><h1>Page not found</h1><p>The page may be planned for a future sprint.</p><Link to="/">Return home</Link></section> }
