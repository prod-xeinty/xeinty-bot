export const telegramCaptionLimit = 1024

export function joinTrackCaption(credits: string, caption = '') {
  return [credits.trim(), caption].filter(Boolean).join('\n\n')
}

export function linkTrackCredits(credits: string) {
  return credits.replace(/\[[^\]\r\n]+\]\(https?:\/\/[^\s()]+\)|https?:\/\/\S+|(?<![\p{L}\p{N}_@/])@([a-zA-Z0-9_]{1,32})(?![a-zA-Z0-9_])/gu,
    (match, username: string | undefined) => username ? '[' + match + '](https://t.me/' + username + ')' : match)
}

export function captionWithLinks(source: string) {
  let caption = ''
  let cursor = 0
  const caption_entities: { type: 'text_link'; offset: number; length: number; url: string }[] = []
  for (const match of source.matchAll(/\[([^\[\]\r\n]+)\]\((https?:\/\/[^\s()]+)\)/g)) {
    const [token, label, address] = match
    const start = match.index!
    let url: URL
    try { url = new URL(address) } catch { continue }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue
    caption += source.slice(cursor, start)
    caption_entities.push({ type: 'text_link', offset: caption.length, length: label.length, url: url.href })
    caption += label
    cursor = start + token.length
  }
  caption += source.slice(cursor)
  return { caption, caption_entities: caption_entities.length ? caption_entities : undefined }
}

export function renderTrackCaption(credits: string, caption?: string) {
  return captionWithLinks(joinTrackCaption(linkTrackCredits(credits), caption))
}
