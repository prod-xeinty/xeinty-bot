import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

function sampleWav() {
  const sampleRate = 8000
  const dataSize = sampleRate * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8)
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

const server = process.env.PERSISTENCE_QA_URL ? null : await createServer({ server: { host: '127.0.0.1', port: 0 } })
if (server) await server.listen()
const url = process.env.PERSISTENCE_QA_URL || `http://127.0.0.1:${server.httpServer.address().port}/`
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
await context.route('https://telegram.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
try {
  const page = await context.newPage()
  await page.goto(url)
  await page.getByRole('button', { name: /Добавить свой бит/ }).click()
  await page.getByPlaceholder('Например, NO SIGNAL').fill('Persist Test')
  await page.locator('input[type=file][accept^="audio/"]').setInputFiles({ name: 'test.wav', mimeType: 'audio/wav', buffer: sampleWav() })
  await page.locator('input[type=file][accept*="image/png"]').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: await readFile('src/assets/monochrome-portrait.png') })
  await page.getByRole('button', { name: /Создать черновик/ }).click()
  await page.getByRole('tab', { name: 'Публикация' }).click()
  await page.getByRole('textbox', { name: 'Подпись для Telegram' }).fill('Мой сохранённый текст')
  await page.getByRole('tab', { name: 'Ссылки' }).click()
  await page.getByPlaceholder('https://t.me/yourchannel/123').fill('https://t.me/xeintybot/123')
  await page.close()

  const reopened = await context.newPage()
  await reopened.goto(url)
  const beat = reopened.locator('.beat-row').filter({ hasText: 'PERSIST TEST' })
  await beat.waitFor({ timeout: 5000 })
  await beat.click()
  if (!await reopened.locator('.detail-audio audio').isVisible()) throw new Error('Audio file was not restored')
  if (!await reopened.locator('.detail-cover').evaluate((element) => getComputedStyle(element).backgroundImage.startsWith('url("blob:'))) throw new Error('Cover file was not restored')
  await reopened.getByRole('tab', { name: 'Публикация' }).click()
  if (await reopened.getByRole('textbox', { name: 'Подпись для Telegram' }).inputValue() !== 'Мой сохранённый текст') throw new Error('Caption was not restored')
  if (!await reopened.getByRole('button', { name: 'Собрать MP4' }).isVisible()) throw new Error('Video inputs were not restored')
  await reopened.getByRole('button', { name: 'Собрать MP4' }).click()
  await reopened.getByRole('button', { name: 'Сохранить MP4' }).waitFor({ timeout: process.env.PERSISTENCE_QA_URL ? 90000 : 30000 })
  await reopened.getByRole('tab', { name: 'Ссылки' }).click()
  if (await reopened.getByPlaceholder('https://t.me/yourchannel/123').inputValue() !== 'https://t.me/xeintybot/123') throw new Error('Link was not restored')
  await reopened.getByRole('tab', { name: 'Данные' }).click()
  await reopened.getByRole('button', { name: 'Удалить бит' }).click()
  await reopened.getByRole('button', { name: 'Подтвердить удаление' }).click()
  await reopened.reload()
  if (await reopened.locator('.beat-row').filter({ hasText: 'PERSIST TEST' }).count()) throw new Error('Deleted beat reappeared')
  console.log('Persistence QA complete: beat and files survive closing the page, export MP4, and can be deleted.')
} finally {
  await browser.close()
  if (server) await server.close()
}
