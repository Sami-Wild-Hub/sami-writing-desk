// Public book list for 小离总周报: titles may be shown before login, and each slug must
// match the private Firebase sync (novelArchive/books/<slug>). Add one line per book.
export const novelBooks = [
  { slug: 'maritime-story', title: 'Maritime Story' },
] as const satisfies readonly { slug: string; title: string }[];
