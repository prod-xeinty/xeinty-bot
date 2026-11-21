export const creativeModes = [
  { id: 'producer', label: 'Продюсер', description: 'Биты, публикации и статистика.' },
  { id: 'artist', label: 'Артист', description: 'Треки, публикации и статистика.' },
  { id: 'loopmaker', label: 'Лупмейкер', description: 'Лупы, биты на них и статистика Telegram.' },
] as const

export type CreativeMode = typeof creativeModes[number]['id']

export function readCreativeMode(): CreativeMode | undefined {
  try {
    const saved = localStorage.getItem('xeinty-creative-mode')
    return creativeModes.find(({ id }) => id === saved)?.id
  } catch {
    return undefined
  }
}
