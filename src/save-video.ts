declare global {
  interface Window {
    showSaveFilePicker?: (options: {
      suggestedName: string
      types: { description: string; accept: Record<string, string[]> }[]
    }) => Promise<FileSystemFileHandle>
  }
}

export async function saveVideoFile(blob: Blob, filename: string): Promise<'saved' | 'cancelled' | 'unsupported'> {
  if (!window.showSaveFilePicker) return 'unsupported'
  try {
    const file = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: 'Видео MP4', accept: { 'video/mp4': ['.mp4'] } }],
    })
    const writer = await file.createWritable()
    await writer.write(blob)
    await writer.close()
    return 'saved'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    throw error
  }
}
