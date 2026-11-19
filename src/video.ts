import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

const videoProfile = { width: 1920, height: 1080, fps: 30, videoMbps: 8, audioKbps: 384, audioHz: 48000 }
export const videoProfileLabel = `MP4 · H.264 · ${videoProfile.width}×${videoProfile.height} · ${videoProfile.fps} кадров/с · до ${videoProfile.videoMbps} Мбит/с · AAC-LC 48 кГц · стерео ${videoProfile.audioKbps} кбит/с`

export type VideoStage = 'loading' | 'preparing' | 'rendering'

async function imageToJpeg(file: File): Promise<Uint8Array> {
  const image = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = videoProfile.width
    canvas.height = videoProfile.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Не удалось подготовить обложку')
    context.fillStyle = '#111111'
    context.fillRect(0, 0, canvas.width, canvas.height)
    const ratio = Math.min(canvas.width / image.width, canvas.height / image.height)
    const width = image.width * ratio
    const height = image.height * ratio
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error('Не удалось обработать обложку')),
      'image/jpeg', .88,
    ))
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    image.close()
  }
}

export async function makeStaticVideo(audio: File, cover: File, onStage: (stage: VideoStage) => void): Promise<Blob> {
  const ffmpeg = new FFmpeg()
  const base = `${import.meta.env.BASE_URL}ffmpeg`
  let coreURL: string | undefined
  let wasmURL: string | undefined
  try {
    onStage('loading')
    coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript')
    wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm')
    await ffmpeg.load({
      coreURL,
      wasmURL,
    })
    onStage('preparing')
    const audioName = audio.name.toLowerCase().endsWith('.wav') ? 'audio.wav' : 'audio.mp3'
    await ffmpeg.writeFile('cover.jpg', await imageToJpeg(cover))
    await ffmpeg.writeFile(audioName, new Uint8Array(await audio.arrayBuffer()))
    onStage('rendering')
    const code = await ffmpeg.exec([
      '-loop', '1', '-framerate', String(videoProfile.fps), '-i', 'cover.jpg',
      '-i', audioName, '-c:v', 'libx264', '-preset', 'ultrafast',
      '-tune', 'stillimage', '-pix_fmt', 'yuv420p',
      '-b:v', videoProfile.videoMbps + 'M', '-maxrate', videoProfile.videoMbps + 'M', '-bufsize', videoProfile.videoMbps * 2 + 'M',
      '-c:a', 'aac', '-profile:a', 'aac_low', '-ar', String(videoProfile.audioHz), '-ac', '2', '-b:a', videoProfile.audioKbps + 'k', '-shortest',
      '-movflags', '+faststart', 'output.mp4',
    ])
    if (code !== 0) throw new Error('Не удалось собрать MP4 из этих файлов')
    const output = await ffmpeg.readFile('output.mp4')
    if (typeof output === 'string') throw new Error('Неверный формат результата')
    return new Blob([Uint8Array.from(output)], { type: 'video/mp4' })
  } finally {
    ffmpeg.terminate()
    if (coreURL) URL.revokeObjectURL(coreURL)
    if (wasmURL) URL.revokeObjectURL(wasmURL)
  }
}
