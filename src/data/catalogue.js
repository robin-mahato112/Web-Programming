import { createResource, createRow, deleteRow, errorMessage, field, listAll, patchRow, readRow } from './backend.js'
import { validateProduct } from './productStore.js'

export const lowStockLimit = 10

// Each genre's sub-genres live in their own table.
const subGenreTables = { Books: 'BookGenre', Movies: 'MovieGenre', Games: 'GameGenre' }

const toOptions = (rows, idField, nameField) => rows.map(row => ({ id: field(row, idField), name: field(row, nameField) }))
const nameById = options => Object.fromEntries(options.map(option => [option.id, option.name]))
const totalQuantity = stock => stock.reduce((total, item) => total + item.quantity, 0)

function toStockItem(row, sources) {
  const sourceId = field(row, 'SourceId')
  return {
    itemId: field(row, 'ItemId'),
    sourceId,
    source: sources.find(source => source.id === sourceId)?.name ?? `Source ${sourceId}`,
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
    listAll('Product', { fields: 'ID,Name,Author,Description,Genre,SubGenre,Published,LastUpdatedBy,LastUpdated' }),
    listAll('Stocktake'),
    listAll('Genre'),
  ])
  const genres = toOptions(genreRows, 'GenreID', 'Name')
  const subGenres = Object.fromEntries(await Promise.all(genres.map(async genre =>
    [genre.id, subGenreTables[genre.name] ? toOptions(await listAll(subGenreTables[genre.name]), 'SubGenreID', 'Name') : []])))
  // GET /Source fails on the backend, but reading each source by id works.
  const sourceIds = [...new Set(stockRows.map(row => field(row, 'SourceId')))].sort((a, b) => a - b)
  const sources = await Promise.all(sourceIds.map(async id => {
    try {
      const row = await readRow('Source', id)
      return { id, name: field(row, 'Source_name') || `Source ${id}`, genreId: field(row, 'Genre') }
    } catch {
      return { id, name: `Source ${id}`, genreId: null }
    }
  }))

  const stockByProduct = {}
  for (const row of stockRows) {
    const items = stockByProduct[field(row, 'ProductId')] ??= []
    items.push(toStockItem(row, sources))
  }

  return {
    genres,
    subGenres,
    sources,
    products: productRows.map(row => toProduct(row, (stockByProduct[field(row, 'ID')] ?? []).sort((a, b) => a.itemId - b.itemId), genres, subGenres)),
  }
}

export const catalogue = createResource(loadCatalogue)

function stockErrors(stock) {
  const errors = {}
  for (const [key, values] of Object.entries(stock)) {
    const rowErrors = validateProduct(values)
    if (rowErrors.price) errors[`${key}-price`] = rowErrors.price
    if (rowErrors.quantity) errors[`${key}-quantity`] = rowErrors.quantity
  }
  return errors
}

// Title and author rules shared by Add product and Edit.
function detailErrors(values) {
  const errors = {}
  if (!values.title.trim() || values.title.trim().length > 255) errors.title = 'Enter a title of 1 to 255 characters.'
  if (!values.author.trim() || values.author.trim().length > 255) errors.author = 'Enter an author, director, or studio of 1 to 255 characters.'
  return errors
}

// values: { title, author, stock: { [itemId]: { price, quantity } } } as strings from the form.
export async function saveProduct(product, values, user) {
  if (user?.role !== 'admin') return { error: 'Only admins can update products.' }
  const errors = { ...detailErrors(values), ...stockErrors(values.stock) }
  if (Object.keys(errors).length) return { errors }

  const title = values.title.trim()
  const author = values.author.trim()
  const detailsChanged = title !== product.title || author !== (product.author ?? '')
  const changed = product.stock
    .map(item => ({ ...item, price: Number(values.stock[item.itemId].price), quantity: Number(values.stock[item.itemId].quantity) }))
    .filter(item => {
      const original = product.stock.find(row => row.itemId === item.itemId)
      return item.price !== original.price || item.quantity !== original.quantity
    })
  if (!detailsChanged && !changed.length) return { saved: false }

  const updatedAt = new Date().toISOString()
  try {
    await Promise.all(changed.map(item => patchRow('Stocktake', item.itemId, { Price: item.price, Quantity: item.quantity })))
    await patchRow('Product', product.id, { ...(detailsChanged && { Name: title, Author: author }), LastUpdatedBy: user.username, LastUpdated: updatedAt })
  } catch (error) {
    catalogue.load() // Some rows may have saved; reload so the table shows what the database holds.
    return { error: errorMessage(error) }
  }
  const stock = product.stock.map(item => changed.find(row => row.itemId === item.itemId) ?? item)
  const updated = { ...product, title, author, stock, quantity: totalQuantity(stock), updatedBy: user.username, updatedAt }
  catalogue.update(data => ({ ...data, products: data.products.map(item => item.id === product.id ? updated : item) }))
  return { saved: true }
}

export function validateNewProduct(values) {
  const errors = detailErrors(values)
  if (!values.genreId) errors.genreId = 'Choose a genre.'
  if (!values.subGenreId) errors.subGenreId = 'Choose a sub-genre.'
  if (values.published && (!/^\d{4}-\d{2}-\d{2}$/.test(values.published) || Number.isNaN(Date.parse(values.published)))) errors.published = 'Enter a valid date.'
  const formats = Object.keys(values.stock)
  if (!formats.length) errors.formats = 'Choose at least one format.'
  return { ...errors, ...stockErrors(values.stock) }
}

// values: { title, author, description, genreId, subGenreId, published, stock: { [sourceId]: { price, quantity } } }
export async function createProduct(values, user) {
  if (user?.role !== 'admin') return { error: 'Only admins can add products.' }
  const errors = validateNewProduct(values)
  if (Object.keys(errors).length) return { errors }

  const data = catalogue.getState().data
  let row
  try {
    row = await createRow('Product', {
      Name: values.title.trim(),
      Author: values.author.trim(),
      Description: values.description.trim() || null,
      Genre: Number(values.genreId),
      SubGenre: Number(values.subGenreId),
      Published: values.published || null,
      LastUpdatedBy: user.username,
      LastUpdated: new Date().toISOString(),
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  const productId = field(row, 'ID')
  let stockRows
  try {
    stockRows = await Promise.all(Object.entries(values.stock).map(([sourceId, item]) =>
      createRow('Stocktake', { SourceId: Number(sourceId), ProductId: productId, Price: Number(item.price), Quantity: Number(item.quantity) })))
  } catch (error) {
    // Don't leave a product without its formats behind; deleting it also removes any stock rows that did save.
    await deleteRow('Product', productId).catch(() => {})
    return { error: errorMessage(error) }
  }

  const product = toProduct(row, stockRows.map(stockRow => toStockItem(stockRow, data.sources)), data.genres, data.subGenres)
  catalogue.update(current => ({ ...current, products: [...current.products, product] }))
  return { product }
}

export async function deleteProduct(product, user) {
  if (user?.role !== 'admin') return { error: 'Only admins can delete products.' }
  try {
    await deleteRow('Product', product.id) // The backend also deletes the product's Stocktake rows and order lines.
  } catch (error) {
    return { error: errorMessage(error) }
  }
  catalogue.update(data => ({ ...data, products: data.products.filter(item => item.id !== product.id) }))
  return {}
}
