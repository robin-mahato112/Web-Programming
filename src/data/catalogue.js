import api from '../api.js'
import { createResource, errorMessage, field, listAll, readRow } from './backend.js'
import { validateProduct } from './productStore.js'

export const lowStockLimit = 10

// Each genre's sub-genres live in their own table.
const subGenreTables = { Books: 'BookGenre', Movies: 'MovieGenre', Games: 'GameGenre' }

const toOptions = (rows, idField, nameField) =>
  rows.map((row) => ({ id: field(row, idField), name: field(row, nameField) }))
const nameById = (options) => Object.fromEntries(options.map((option) => [option.id, option.name]))
const totalQuantity = (stock) => stock.reduce((total, item) => total + item.quantity, 0)

function toStockItem(row, sources) {
  const sourceId = field(row, 'SourceId')
  return {
    itemId: field(row, 'ItemId'),
    sourceId,
    source: sources.find((source) => source.id === sourceId)?.name ?? `Source ${sourceId}`,
    price: Number(field(row, 'Price')),
    quantity: Number(field(row, 'Quantity')),
  }
}

function toProduct(row, stock, genres, subGenres) {
  const genreId = field(row, 'Genre')
  return {
    id: field(row, 'ID'),
    title: field(row, 'Name'),
    author: field(row, 'Author'),
    description: field(row, 'Description') ?? '',
    genreId,
    genre: nameById(genres)[genreId] ?? 'Unknown',
    subGenre: nameById(subGenres[genreId] ?? [])[field(row, 'SubGenre')] ?? '',
    published: field(row, 'Published'),
    updatedBy: field(row, 'LastUpdatedBy'),
    updatedAt: field(row, 'LastUpdated'),
    stock,
    quantity: totalQuantity(stock),
  }
}

async function loadCatalogue() {
  const [productRows, stockRows, genreRows] = await Promise.all([
    listAll('Product', {
      fields: 'ID,Name,Author,Description,Genre,SubGenre,Published,LastUpdatedBy,LastUpdated',
    }),
    listAll('Stocktake'),
    listAll('Genre'),
  ])
  const genres = toOptions(genreRows, 'GenreID', 'Name')
  const subGenres = Object.fromEntries(
    await Promise.all(
      genres.map(async (genre) => [
        genre.id,
        subGenreTables[genre.name]
          ? toOptions(await listAll(subGenreTables[genre.name]), 'SubGenreID', 'Name')
          : [],
      ]),
    ),
  )
  // GET /Source fails on the backend, but reading each source by id works.
  const sourceIds = [...new Set(stockRows.map((row) => field(row, 'SourceId')))].sort(
    (a, b) => a - b,
  )
  const sources = await Promise.all(
    sourceIds.map(async (id) => {
      try {
        const row = await readRow('Source', id)
        return {
          id,
          name: field(row, 'Source_name') || `Source ${id}`,
          genreId: field(row, 'Genre'),
        }
      } catch {
        return { id, name: `Source ${id}`, genreId: null }
      }
    }),
  )

  const stockByProduct = {}
  for (const row of stockRows) {
    const items = (stockByProduct[field(row, 'ProductId')] ??= [])
    items.push(toStockItem(row, sources))
  }

  return {
    genres,
    subGenres,
    sources,
    products: productRows.map((row) =>
      toProduct(
        row,
        (stockByProduct[field(row, 'ID')] ?? []).sort((a, b) => a.itemId - b.itemId),
        genres,
        subGenres,
      ),
    ),
  }
}

export const catalogue = createResource(loadCatalogue)

function stockErrors(stock, discount = '0') {
  const errors = {}
  for (const [key, values] of Object.entries(stock)) {
    const rowErrors = validateProduct({ ...values, discount })
    if (rowErrors.price) errors[`${key}-price`] = rowErrors.price
    if (rowErrors.quantity) errors[`${key}-quantity`] = rowErrors.quantity
    if (rowErrors.discount) errors.discount = rowErrors.discount
  }
  return errors
}

// values: { discount, stock: { [itemId]: { price, quantity } } } as strings from the form.
export async function saveProduct(product, values, user) {
  if (user?.role !== 'admin') return { error: 'Only admins can update products.' }
  const errors = stockErrors(values.stock, values.discount)
  if (Object.keys(errors).length) return { errors }

  const changed = product.stock
    .map((item) => ({
      ...item,
      price: Number(values.stock[item.itemId].price),
      quantity: Number(values.stock[item.itemId].quantity),
    }))
    .filter((item) => {
      const original = product.stock.find((row) => row.itemId === item.itemId)
      return item.price !== original.price || item.quantity !== original.quantity
    })

  if (!changed.length) return { savedToDatabase: false }
  try {
    await api.patch(
      '/api/admin/products/' + product.id,
      {
        listings: changed.map((item) => ({
          itemId: item.itemId,
          price: item.price,
          quantity: item.quantity,
          expected: {
            price: product.stock.find((row) => row.itemId === item.itemId).price,
            quantity: product.stock.find((row) => row.itemId === item.itemId).quantity,
          },
        })),
      },
      { headers: { 'X-Management-Request': '1' } },
    )
    await catalogue.load()
    globalThis.dispatchEvent?.(new Event('entertainment-guild:catalogue-changed'))
    return { savedToDatabase: true }
  } catch (error) {
    await catalogue.load()
    globalThis.dispatchEvent?.(new Event('entertainment-guild:catalogue-changed'))
    return { error: errorMessage(error) }
  }
}

export function validateNewProduct(values) {
  const errors = {}
  if (!values.title.trim() || values.title.trim().length > 255)
    errors.title = 'Enter a title of 1 to 255 characters.'
  if (!values.author.trim() || values.author.trim().length > 255)
    errors.author = 'Enter an author, director, or studio of 1 to 255 characters.'
  if (!values.genreId) errors.genreId = 'Choose a genre.'
  if (!values.subGenreId) errors.subGenreId = 'Choose a sub-genre.'
  if (
    values.published &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(values.published) || Number.isNaN(Date.parse(values.published)))
  )
    errors.published = 'Enter a valid date.'
  const formats = Object.keys(values.stock)
  if (!formats.length) errors.formats = 'Choose at least one format.'
  return { ...errors, ...stockErrors(values.stock) }
}

// values: { title, author, description, genreId, subGenreId, published, stock: { [sourceId]: { price, quantity } } }
export async function createProduct(values, user) {
  if (user?.role !== 'admin') return { error: 'Only admins can add products.' }
  const errors = validateNewProduct(values)
  if (Object.keys(errors).length) return { errors }

  try {
    const { data } = await api.post(
      '/api/admin/products',
      {
        title: values.title,
        author: values.author,
        description: values.description,
        genreId: Number(values.genreId),
        subGenreId: Number(values.subGenreId),
        published: values.published,
        listings: Object.entries(values.stock).map(([sourceId, item]) => ({
          sourceId: Number(sourceId),
          price: Number(item.price),
          quantity: Number(item.quantity),
        })),
      },
      { headers: { 'X-Management-Request': '1' } },
    )
    await catalogue.load()
    globalThis.dispatchEvent?.(new Event('entertainment-guild:catalogue-changed'))
    return { product: { id: data.productId, title: values.title } }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}

// Orders retain their source listing identity. The backend refuses deletion of ordered products.
export async function deleteProduct(product, user) {
  if (user?.role !== 'admin') return { error: 'Only admins can delete products.' }
  try {
    await api.delete('/api/admin/products/' + product.id, {
      data: {},
      headers: { 'X-Management-Request': '1' },
    })
    await catalogue.load()
    globalThis.dispatchEvent?.(new Event('entertainment-guild:catalogue-changed'))
    return {}
  } catch (error) {
    return { error: errorMessage(error) }
  }
}
