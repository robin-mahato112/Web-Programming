// Sprint 1 demo data only. Replace this module with the approved database layer later.
const sampleUpdates = {
  'stellar-odyssey': '2026-09-16T09:30:00Z',
  'pixel-legends': '2026-09-15T14:00:00Z',
  'midnight-reel': '2026-09-14T10:15:00Z',
  'guild-anthems': '2026-09-13T08:45:00Z',
  dragonfall: '2026-09-12T11:00:00Z',
  'neon-arena': '2026-09-11T15:30:00Z',
}
export const mockProducts = [
  { id: 'stellar-odyssey', title: 'Stellar Odyssey', category: 'Board Game', price: 54.95, rating: '4.8', accent: 'violet', description: 'A cooperative journey across a hand-painted galaxy for 2–5 players.' },
  { id: 'pixel-legends', title: 'Pixel Legends', category: 'Video Game', price: 39.99, rating: '4.6', accent: 'cyan', description: 'Build a party of unlikely heroes in a bright retro adventure.' },
  { id: 'midnight-reel', title: 'Midnight Reel', category: 'Film', price: 19.95, rating: '4.4', accent: 'rose', description: 'A restored collector edition of the cult mystery classic.' },
  { id: 'guild-anthems', title: 'Guild Anthems', category: 'Music', price: 24.5, rating: '4.7', accent: 'gold', description: 'An energetic double-vinyl soundtrack for legendary campaigns.' },
  { id: 'dragonfall', title: 'Dragonfall Chronicles', category: 'Book', price: 16.99, rating: '4.9', accent: 'orange', description: 'The first illustrated volume in an epic fantasy trilogy.' },
  { id: 'neon-arena', title: 'Neon Arena', category: 'Card Game', price: 29.0, rating: '4.5', accent: 'blue', description: 'Fast tactical matches in a vivid cyberpunk competition.' },
].map(product => ({ ...product, updatedAt: sampleUpdates[product.id], updatedBy: 'Taylor Smith' }))
