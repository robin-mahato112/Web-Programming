// StoreDB has no discount field. Display its stored prices consistently through checkout.
// Retain this interface for the existing dashboard; no browser-only reductions are applied.
const discounts = Object.freeze({})
export const useDiscounts = () => discounts
export const setDiscount = (_productId, value) => Number(value) === 0
