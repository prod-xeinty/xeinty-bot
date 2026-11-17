import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const source = join('node_modules', '@ffmpeg', 'core', 'dist', 'esm')
const target = join('public', 'ffmpeg')

await mkdir(target, { recursive: true })
await Promise.all(['ffmpeg-core.js', 'ffmpeg-core.wasm'].map((name) =>
  copyFile(join(source, name), join(target, name)),
))
