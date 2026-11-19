export const telegramCaptionLimit = 1024

export function joinTrackCaption(credits: string, caption = '') {
  return [credits.trim(), caption].filter(Boolean).join('\n\n')
}

export function linkTrackCredits(credits: string) {
  return credits.replace(/\[[^\]\r\n]+\]\(https?:\/\/[^\s()]+\)|https?:\/\/\S+|(?<![\p{L}\p{N}_@/])@([a-zA-Z0-9_]{1,32})(?![a-zA-Z0-9_])/gu,
    (match, username: string | undefined) => username ? '[' + match + '](https://t.me/' + username + ')' : match)
}
