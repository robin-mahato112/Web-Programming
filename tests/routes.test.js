/**
 * Render the real route tree with its cart provider to catch broken imports,
 * layout wiring and missing-record handling. An explicitly injected catalogue
 * keeps these cases independent of HTTP and SQL Server. Vite transforms JSX
 * in memory; MemoryRouter supplies each URL without starting a browser.
 * These checks cover initial markup; event handlers require interaction tests.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { catalogue } from './fixtures/catalogue.js'

let server
let App
let CartProvider
let AuthContext

before(async () => {
  server = await createServer({
    define: { 'import.meta.env.VITE_CATALOGUE_SOURCE': JSON.stringify('') },
    server: { middlewareMode: true },
    appType: 'custom',
  })
  AuthContext = (await server.ssrLoadModule('/src/store/authContext.js')).AuthContext
  App = (await server.ssrLoadModule('/src/App.jsx')).default
  CartProvider = (await server.ssrLoadModule('/src/store/CartContext.jsx')).CartProvider
})

after(async () => {
  await server?.close()
})

/**
 * Render one URL against the same provider and route components used by the app.
 * Each call starts with a fresh provider instance so cart state cannot leak between cases.
 *
 * @param {string} path - Storefront path to render.
 * @param {object} [options] Provider data, including an unresolved catalogue.
 * @returns {string} Server-rendered HTML for content assertions.
 */
function renderRoute(
  path,
  { initialProducts = catalogue, initialItems = [], loading = false, auth = {} } = {},
) {
  return renderToString(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        CartProvider,
        { initialProducts: loading ? undefined : initialProducts, initialItems },
        createElement(
          AuthContext.Provider,
          {
            value: {
              user: {
                id: '1',
                name: 'Test Customer',
                email: 'test@example.test',
                role: 'customer',
              },
              loading: false,
              ...auth,
            },
          },
          createElement(App),
        ),
      ),
    ),
  )
}

for (const [path, expected] of [
  ['/products', 'Good times.'],
  ['/products/1', 'Add to cart'],
  ['/products/3', 'Out of stock'],
  ['/products/unknown', 'Product not found'],
  ['/cart', 'Your cart is empty'],
  ['/checkout', 'Checkout'],
  ['/missing-page', 'Page not found'],
]) {
  test(`route ${path} renders its content without errors`, () => {
    assert.ok(renderRoute(path).includes(expected))
  })
}

test('checkout waits for session restoration and denies staff without showing payment controls', () => {
  const pending = renderRoute('/checkout', { auth: { user: null, loading: true } })
  assert.match(pending, /Checking customer session/)
  assert.doesNotMatch(pending, /Customer and delivery details/)
  for (const role of ['admin', 'employee']) {
    const html = renderRoute('/checkout', { auth: { user: { role } } })
    assert.match(html, /Customer account required/)
    assert.doesNotMatch(html, /Customer and delivery details/)
  }
})

test('unknown routes offer a catalogue link that keeps the search settings', () => {
  const html = renderRoute('/missing?q=book&sort=name')
  assert.match(html, /Page not found/)
  assert.match(html, /href="\/products\?q=book&amp;sort=name"/)
})

test('loaded cart uses the injected stock offers', () => {
  const initialItems = [
    { itemId: '101', quantity: 1 },
    { itemId: '102', quantity: 1 },
  ]
  const cart = renderRoute('/cart', { initialItems })
  assert.ok(cart.includes('Test book'))
  assert.ok(cart.includes('Test game'))
})

test('product pages show loading before treating the catalogue as empty', () => {
  assert.ok(renderRoute('/products', { loading: true }).includes('Loading products'))
  assert.ok(renderRoute('/products/1', { loading: true }).includes('Loading product'))
})

test('a loaded empty catalogue does not invent products or starter cart items', () => {
  assert.ok(renderRoute('/products', { initialProducts: [] }).includes('No products available'))
  assert.ok(renderRoute('/products/1', { initialProducts: [] }).includes('Product not found'))
  assert.ok(renderRoute('/cart', { initialProducts: [] }).includes('Your cart is empty'))
})

test('cart shows both selected sources for one product at their own prices', () => {
  const html = renderRoute('/cart', {
    initialItems: [
      { itemId: '101', quantity: 1 },
      { itemId: '104', quantity: 1 },
    ],
  })
  assert.ok(html.includes('Store A'))
  assert.ok(html.includes('Store B'))
  assert.ok(html.includes('$54.95'))
  assert.ok(html.includes('$59.95'))
  assert.match(html, /Total \(AUD\).*114\.90/)
})

test('cart line and summary preserve the same cents for large valid prices', () => {
  const price = 30023997515793.35
  const product = {
    ...catalogue[0],
    price,
    stock: 3,
    offers: [{ ...catalogue[0].offers[0], price, stock: 3 }],
  }
  const html = renderRoute('/cart', {
    initialProducts: [product],
    initialItems: [{ itemId: '101', quantity: 3 }],
  })
  assert.equal((html.match(/90071992547380\.05/g) || []).length, 2)
  assert.ok(!html.includes('90071992547380.06'))
})

test('search has an accessible submit action and renders URL-backed controls', () => {
  const html = renderRoute('/products?q=book&category=Books&price=60&stock=1&sort=name')
  assert.match(html, /role="search"/)
  assert.match(html, /type="submit">Search/)
  assert.match(html, /value="book"/)
  assert.match(html, /value="name" selected/)
  assert.match(html, /type="checkbox" checked/)
})

test('details preserve search links and select the listing identified in the URL', () => {
  const html = renderRoute('/products/1?q=book&sort=name&item=104')
  assert.match(html, /\$59\.95/)
  assert.match(html, /value="104" selected/)
  assert.match(html, /href="\/products\?q=book&amp;sort=name"/)
  assert.match(html, /href="\/cart\?q=book&amp;sort=name"/)
  assert.match(html, /role="status"/)
})

test('cart returns to previous results and details of the exact selected source', () => {
  const html = renderRoute('/cart?q=book&sort=name', {
    initialItems: [{ itemId: '104', quantity: 1 }],
  })
  assert.match(html, /href="\/products\?q=book&amp;sort=name"/)
  assert.match(html, /href="\/products\/1\?q=book&amp;sort=name&amp;item=104"/)
})

test('a removed source in a bookmarked URL cannot silently buy a different listing', () => {
  const html = renderRoute('/products/1?item=999')
  assert.match(html, /The selected source is no longer available/)
  assert.match(html, /disabled="">Choose a source/)
  assert.doesNotMatch(html, />Add to cart</)
})

test('checkout uses customer-facing wording and preserves search navigation', () => {
  const html = renderRoute('/checkout?q=book&sort=name', {
    initialItems: [{ itemId: '101', quantity: 1 }],
  })
  assert.doesNotMatch(html, /Test checkout|demonstration|StoreDB|demo card/)
  assert.match(html, /Customer and delivery details/)
  assert.match(html, /name="postcode"/)
  assert.match(html, /href="\/products\?q=book&amp;sort=name"/)
  assert.doesNotMatch(html, /name="(?:cardNumber|cvv)"/)
})

test('new checkout ignores completed receipts but retains unresolved payment recovery', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  let applied = true
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key) =>
        key.startsWith('entertainment-guild.checkout.v2.')
          ? JSON.stringify({ token: 'saved-attempt', applied })
          : null,
    },
  })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous)
    else delete globalThis.sessionStorage
  })
  const cart = { initialItems: [{ itemId: '101', quantity: 1 }] }
  assert.match(renderRoute('/checkout', cart), /Customer and delivery details/)
  assert.doesNotMatch(
    renderRoute('/checkout/confirmation/saved-attempt', cart),
    /Customer and delivery details/,
  )
  applied = false
  const pending = renderRoute('/checkout', cart)
  assert.match(pending, /Payment reference/)
  assert.doesNotMatch(pending, /Customer and delivery details/)
})
