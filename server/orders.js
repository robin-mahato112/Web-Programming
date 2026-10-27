import { databasePrice } from './catalogue.js'

export const states = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']

export class CheckoutError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

/** Match the supplied table lengths; accept names and addresses without ASCII-only restrictions. */
export function validateCustomer(value) {
  const customer = {}
  for (const [key, maximum] of Object.entries({
    name: 255,
    email: 255,
    phone: 50,
    street: 255,
    suburb: 50,
    postcode: 4,
    state: 3,
  })) {
    const text = typeof value?.[key] === 'string' ? value[key].trim() : ''
    if (
      (!text && key !== 'phone') ||
      text.length > maximum ||
      [...text].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    )
      throw new CheckoutError(`Enter a valid ${key} (up to ${maximum} characters).`)
    customer[key] = text
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))
    throw new CheckoutError('Enter a valid email address.')
  if (!/^\d{4}$/.test(customer.postcode)) throw new CheckoutError('Enter a four-digit postcode.')
  if (!states.includes(customer.state))
    throw new CheckoutError('Choose an Australian state or territory.')
  if (customer.phone && !/^\+?[\d ()-]{6,50}$/.test(customer.phone))
    throw new CheckoutError('Enter a valid phone number or leave it empty.')
  return customer
}

/**
 * Lock only the purchased listings, in ID order, so simultaneous checkouts cannot oversell.
 * A reviewed price/source must still match before any customer or order rows are inserted.
 * The caller owns the transaction: failures roll back every insert and stock deduction together.
 */
export async function writeOrder(transaction, quote, customer, patronId) {
  if (!Number.isInteger(patronId) || patronId < 1)
    throw new CheckoutError('Customer sign-in is required.', 401)
  const lines = [...quote.items].sort((a, b) => Number(a.itemId) - Number(b.itemId))
  for (const line of lines) {
    const { recordset } = await transaction.request().input('itemId', Number(line.itemId)).query(`
      SELECT ItemId, ProductId, SourceId, Quantity, Price
      FROM dbo.Stocktake WITH (UPDLOCK, HOLDLOCK) WHERE ItemId = @itemId`)
    const stock = recordset[0]
    const source = line.product.offers.find((offer) => offer.itemId === line.itemId)
    if (
      !stock ||
      String(stock.ProductId) !== line.productId ||
      String(stock.SourceId) !== source.sourceId ||
      !Number.isInteger(stock.Quantity) ||
      stock.Quantity < line.quantity ||
      databasePrice(stock.Price) !== line.product.price
    )
      throw new CheckoutError(
        'A selected price, source or quantity has changed. Return to your cart, check availability and review checkout again.',
        409,
      )
  }

  // Ownership comes from the authenticated session. Each order keeps a separate address snapshot.
  const contactRequest = transaction.request().input('patron', patronId)
  // StoreDB uses numeric postcode columns, so conversion is required at the SQL boundary.
  // The validated string remains in the checkout journal to preserve leading zeroes in receipts.
  for (const [key, value] of Object.entries(customer))
    contactRequest.input(key, key === 'postcode' ? Number(value) : value)
  const contact = await contactRequest.query(`
    INSERT [dbo].[TO] (PatronId, Email, PhoneNumber, StreetAddress, PostCode, Suburb, State)
    OUTPUT INSERTED.customerID AS id VALUES (@patron, @email, @phone, @street, @postcode, @suburb, @state)`)
  // CardNumber, CardOwner, Expiry and CVV are deliberately unused by the test-payment flow.
  const order = await transaction
    .request()
    .input('customer', Number(contact.recordset[0].id))
    .input('street', customer.street)
    .input('postcode', Number(customer.postcode))
    .input('suburb', customer.suburb)
    .input('state', customer.state).query(`
      INSERT dbo.Orders (customer, StreetAddress, PostCode, Suburb, State)
      OUTPUT INSERTED.OrderID AS id VALUES (@customer, @street, @postcode, @suburb, @state)`)
  const orderId = String(order.recordset[0].id)
  // Despite its name, produktId references Stocktake.ItemId in the supplied schema. Writing the
  // product title's ID here would misidentify the ordered source even if the stock update used itemId.
  for (const line of lines) {
    await transaction
      .request()
      .input('orderId', Number(orderId))
      .input('itemId', Number(line.itemId))
      .input('quantity', line.quantity).query(`
        INSERT dbo.ProductsInOrders (OrderId, produktId, Quantity) VALUES (@orderId, @itemId, @quantity);
        UPDATE dbo.Stocktake SET Quantity = Quantity - @quantity WHERE ItemId = @itemId;`)
  }
  return {
    orderId,
    items: quote.items.map(({ itemId, quantity }) => ({ itemId, quantity })),
    total: quote.subtotal,
  }
}

export async function saveOrder(database, quote, customer, patronId) {
  const transaction = (await database.getPool()).transaction()
  await transaction.begin()
  let committing = false
  try {
    const order = await writeOrder(transaction, quote, customer, patronId)
    committing = true
    await transaction.commit()
    return order
  } catch (error) {
    await transaction.rollback().catch(() => {})
    // A lost commit acknowledgement is ambiguous; never invite a new payment automatically.
    if (committing)
      throw new CheckoutError(
        'The order result is uncertain. Check Orders in SSMS before starting another checkout.',
        502,
      )
    throw error
  }
}
