// Synthetic catalogue IDs mirror the schema without using seeded customer data.
export const catalogue = [
  {
    id: '1',
    title: 'Test book',
    category: 'Books',
    description: 'A test book.',
    accent: 'orange',
    price: 54.95,
    stock: 12,
    offers: [
      { itemId: '101', sourceId: '1', sourceName: 'Store A', price: 54.95, stock: 12 },
      { itemId: '104', sourceId: '2', sourceName: 'Store B', price: 59.95, stock: 4 },
    ],
  },
  {
    id: '2',
    title: 'Test game',
    category: 'Games',
    description: 'A test game.',
    accent: 'violet',
    price: 39.99,
    stock: 5,
    offers: [{ itemId: '102', sourceId: '1', sourceName: 'Store A', price: 39.99, stock: 5 }],
  },
  {
    id: '3',
    title: 'Test film',
    category: 'Movies',
    description: 'A test film.',
    accent: 'rose',
    price: 19.95,
    stock: 0,
    offers: [{ itemId: '103', sourceId: '1', sourceName: 'Store A', price: 19.95, stock: 0 }],
  },
]
