import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

function sampleWav() {
  const sampleRate = 8000
  const dataSize = sampleRate * 3 * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8)
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < sampleRate * 3; i++) buffer.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / sampleRate) * 8000), 44 + i * 2)
  return buffer
}

const server = process.env.VIDEO_QA_URL ? null : await createServer({ server: { host: '127.0.0.1', port: 0 } })
if (server) await server.listen()
const url = process.env.VIDEO_QA_URL || `http://127.0.0.1:${server.httpServer.address().port}/`
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
await page.addInitScript(() => {
  window.showSaveFilePicker = async (options) => {
    window.__savedVideoName = options.suggestedName
    return { createWritable: async () => ({ write: async (blob) => { window.__savedVideoBytes = blob.size }, close: async () => {} }) }
  }
})
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
page.on('requestfailed', (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`))
await page.route('https://telegram.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
try {
  await page.goto(url)
  await page.getByRole('button', { name: /Добавить свой бит/ }).click()
  await page.getByPlaceholder('Например, NO SIGNAL').fill('Test Video')
  await page.locator('input[type=file][accept^="audio/"]').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: sampleWav() })
  await page.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: await readFile('src/assets/monochrome-portrait.png') })
  await page.getByRole('button', { name: /Создать черновик/ }).click()
  await page.getByRole('tab', { name: 'Публикация' }).click()
  await page.getByRole('button', { name: 'Собрать MP4' }).click()
  try {
    await page.getByRole('button', { name: 'Сохранить MP4' }).waitFor({ timeout: process.env.VIDEO_QA_URL ? 90000 : 30000 })
  } catch {
    throw new Error(`Video state: ${await page.locator('.video-tool').innerText()}\n${errors.join('\n')}`)
  }
  const result = await page.locator('.video-result video').evaluate(async (video) => {
    await new Promise((resolve, reject) => {
      if (video.readyState >= 1) resolve()
      else { video.onloadedmetadata = resolve; video.onerror = reject }
    })
    const data = new Uint8Array(await (await fetch(video.src)).arrayBuffer())
    const text = new TextDecoder('latin1').decode(data)
    return { width: video.videoWidth, height: video.videoHeight, duration: video.duration, bytes: data.length, header: text.slice(4, 8), hasAudio: text.includes('soun') }
  })
  if (result.width !== 960 || result.height !== 540 || result.duration < 2.5 || result.duration > 3.5 || result.header !== 'ftyp' || !result.hasAudio) throw new Error(`Invalid MP4: ${JSON.stringify(result)}`)
  await page.getByRole('button', { name: 'Сохранить MP4' }).click()
  await page.waitForFunction(() => window.__savedVideoBytes > 0)
  const saved = await page.evaluate(() => ({ name: window.__savedVideoName, bytes: window.__savedVideoBytes }))
  if (saved.name !== 'test-video.mp4' || saved.bytes !== result.bytes) throw new Error(`Save failed: ${JSON.stringify(saved)}`)
  await page.evaluate(() => {
    delete window.showSaveFilePicker
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: ({ files }) => files?.length === 1 })
    Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }) => {
      window.__sharedVideoName = files[0].name
      window.__sharedVideoBytes = files[0].size
    } })
  })
  await page.getByRole('button', { name: 'Сохранить MP4' }).click()
  await page.waitForFunction(() => window.__sharedVideoBytes > 0, null, { timeout: 5000 })
  const shared = await page.evaluate(() => ({ name: window.__sharedVideoName, bytes: window.__sharedVideoBytes }))
  if (shared.name !== 'test-video.mp4' || shared.bytes !== result.bytes) throw new Error(`Share failed: ${JSON.stringify(shared)}`)
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(JSON.stringify(result))
} finally {
  await browser.close()
  if (server) await server.close()
}
