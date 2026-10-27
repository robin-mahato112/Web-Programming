// Zehai: registration validation and the visual checklist use the same rules.
export const passwordRequirements = [
  { label: 'At least 8 characters', test: (value) => value.length >= 8 },
  { label: 'Contains a letter', test: (value) => /[A-Za-z]/.test(value) },
  { label: 'Contains a number', test: (value) => /\d/.test(value) },
]

export const validPassword = (value) => passwordRequirements.every((rule) => rule.test(value))
