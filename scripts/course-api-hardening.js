/** Remove the supplied server's account/token debug output without changing request handling.
 * Error objects can contain SQL parameters, so retain only a fixed failure message.
 * Refuse unfamiliar logging syntax rather than silently leaving a sensitive log behind. */
export function hardenCourseLogging(source) {
  return source
    .split('\n')
    .map((line) => {
      if (!line.includes('console.')) return line
      if (
        line.trim() === 'console.log(`Auth server listening on :${PORT}`);' ||
        line.trim() ===
          "console.error('WARNING: Using default JWT_SECRET in production is insecure!');"
      )
        return line
      const match = line.match(/^(\s*)console\.(log|error)\(.*\);\s*$/)
      if (!match) throw new Error('Review unfamiliar university console logging before installing')
      return match[2] === 'error'
        ? `${match[1]}console.error('University API operation failed.');`
        : ''
    })
    .join('\n')
}

/** The v1.1 wildcard grants anonymous order reads and patron order-line writes.
 * Keep patron reads under the supplied RLS; purchases must go through transactional checkout. */
export function hardenCourseOrderAccess(source) {
  const marker = '// Project checkout order access'
  if (source.includes(marker)) return source
  const anonymous = '  [ROLES.ANON]: {\n    allow:'
  const patron = 'deny: [{ tables: USER_TABLE_ALIASES, actions: ACTIONS_ALL }]'
  const anonymousDeny = '    deny: [\n      { tables: USER_TABLE_ALIASES, actions: ACTIONS_ALL },'
  source = source.replaceAll('\r\n', '\n')
  if (!source.includes(anonymous) || !source.includes(patron) || !source.includes(anonymousDeny))
    throw new Error('Review changed university order permissions before installing')
  source = source.replace(
    patron,
    "deny: [{ tables: USER_TABLE_ALIASES, actions: ACTIONS_ALL }, { tables: ['productsinorders', 'dbo.productsinorders'], actions: [ACTIONS.WRITE] }]",
  )
  return source.replace(
    anonymousDeny,
    `    ${marker}\n    deny: [\n      { tables: ORDER_TABLE_ALIASES, actions: ACTIONS_ALL },\n      { tables: USER_TABLE_ALIASES, actions: ACTIONS_ALL },`,
  )
}

/** Course requirements give employees read-only item access, unlike the supplied wildcard rule. */
export function hardenCourseStockAccess(source) {
  const marker = '// Project admin-only catalogue writes'
  if (source.includes(marker)) return source
  source = source.replaceAll('\r\n', '\n')
  const anchor =
    "  [ROLES.STAFF]: {\n    allow: [{ tables: ['*'], actions: [ACTIONS.READ, ACTIONS.WRITE] }],\n    deny: ["
  if (!source.includes(anchor))
    throw new Error('Review changed university staff permissions before installing')
  const tables = [
    'stocktake',
    'product',
    'source',
    'genre',
    'book_genre',
    'movie_genre',
    'game_genre',
  ].flatMap((table) => [table, 'dbo.' + table])
  return source.replace(
    anchor,
    anchor +
      `\n      ${marker}\n      { tables: ${JSON.stringify(tables)}, actions: [ACTIONS.WRITE] },`,
  )
}
