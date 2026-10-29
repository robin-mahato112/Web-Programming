export function basicCustomerEmail(value) {
  if (typeof value !== 'string') return false
  const email = value.trim()
  return email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function validCustomerEmail(value) {
  if (!basicCustomerEmail(value)) return false
  const email = value.trim()
  const [local, domain] = email.split('@')
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..'))
    return false
  return domain.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
}
