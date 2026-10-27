import { apiBaseUrl } from '../api-config.js'
// Remember only delivery fields on this browser, separated by account and API/database.
// Email always comes from the current session; card fields and tokens must never enter this draft.
const prefix = 'entertainment-guild.delivery.v2.' + apiBaseUrl + '.'
const limits = { name: 255, phone: 50, street: 255, suburb: 50, postcode: 4, state: 3 }
function deliveryFields(value) {
  // Storage is user-editable: allow only known strings here, then let checkout validate their
  // actual content. This allowlist prevents future payment/account fields leaking into a draft.
  return Object.fromEntries(
    Object.entries(limits)
      .filter(([key, limit]) => typeof value?.[key] === 'string' && value[key].length <= limit)
      .map(([key]) => [key, value[key]]),
  )
}
export function readDelivery(accountId) {
  try {
    return deliveryFields(JSON.parse(localStorage.getItem(prefix + accountId)))
  } catch {
    return {}
  }
}
export function saveDelivery(value, accountId) {
  try {
    if (value) localStorage.setItem(prefix + accountId, JSON.stringify(deliveryFields(value)))
    else localStorage.removeItem(prefix + accountId)
    return true
  } catch {
    // Storage is optional for delivery convenience; checkout still validates the submitted form.
    return false
  }
}
