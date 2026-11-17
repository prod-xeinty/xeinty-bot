import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'vite'

function silentWav() {
  const sampleRate = 8000
  const dataSize = sampleRate * 10 * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8)
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

await mkdir('docs/design', { recursive: true })
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } })
await server.listen()
const address = server.httpServer.address()
const url = `http://127.0.0.1:${address.port}/`
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
for (const [name, width, height] of [['mobile', 390, 844], ['desktop', 1440, 900], ['small-mobile', 320, 740]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.route('https://telegram.org/**', (route) => route.abort())
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(350)
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error(`Horizontal overflow at ${width}px`)
  await page.screenshot({ path: `docs/design/${name}-library.png`, fullPage: true })
  await page.getByRole('button', { name: /Открыть бит/ }).click()
  await page.waitForTimeout(350)
  await page.screenshot({ path: `docs/design/${name}-publication.png`, fullPage: true })
  await page.getByRole('tab', { name: 'Ссылки' }).click()
  await page.getByPlaceholder('https://t.me/yourchannel/123').fill('https://t.me/xeintybot/123')
  await page.getByRole('tab', { name: 'Публикация' }).click()
  await page.getByRole('textbox', { name: 'Подпись для Telegram' }).fill('Тестовая подпись')
  if (await page.getByRole('textbox', { name: 'Подпись для Telegram' }).inputValue() !== 'Тестовая подпись') throw new Error('Caption edit failed')
  if (width <= 600) {
    await page.getByRole('tab', { name: 'YouTube' }).click()
    await page.screenshot({ path: `docs/design/${name}-youtube.png`, fullPage: true })
  }
  await page.getByRole('textbox', { name: 'Ключевые слова YouTube' }).fill('new type beat, test')
  if (await page.getByRole('textbox', { name: 'Ключевые слова YouTube' }).inputValue() !== 'new type beat, test') throw new Error('Keywords edit failed')
  await page.getByRole('button', { name: 'XEINTY — к библиотеке' }).click()
  await page.getByRole('button', { name: /Добавить свой бит/ }).click()
  await page.getByPlaceholder('Например, NO SIGNAL').fill('Test Beat')
  await page.getByPlaceholder('138').fill('120')
  await page.waitForTimeout(350)
  await page.screenshot({ path: `docs/design/${name}-create.png`, fullPage: true })
  if (name === 'mobile') await page.locator('input[type=file][accept^="audio/"]').setInputFiles({ name: 'test.wav', mimeType: 'audio/wav', buffer: silentWav() })
  await page.getByRole('button', { name: /Создать черновик/ }).click()
  if (!await page.getByRole('heading', { name: 'TEST BEAT' }).isVisible()) throw new Error('Draft creation failed')
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error(`Detail overflow at ${width}px`)
  if (name === 'mobile') {
    await page.getByRole('button', { name: 'XEINTY — к библиотеке' }).click()
    await page.getByRole('button', { name: 'Воспроизвести' }).click()
    if (!await page.getByRole('button', { name: 'Пауза' }).isVisible()) throw new Error('Audio did not begin playing')
    await page.getByRole('button', { name: /Открыть бит/ }).click()
    await page.getByRole('button', { name: 'Все биты' }).click()
    if (!await page.getByRole('button', { name: 'Воспроизвести' }).isVisible()) throw new Error('Player state was not reset after navigation')
  }
  await page.close()
}
await browser.close()
await server.close()
if (errors.length) throw new Error(errors.join('\n'))
console.log('Visual QA complete: 320px, 390px and desktop; publication, draft creation and player reset after navigation.')
