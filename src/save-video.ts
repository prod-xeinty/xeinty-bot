declare global {
  interface Window {
    showSaveFilePicker?: (options: {
      suggestedName: string
      types: { description: string; accept: Record<string, string[]> }[]
    }) => Promise<FileSystemFileHandle>
  }
}

export async function saveVideoFile(blob: Blob, filename: string): Promise<'saved' | 'shared' | 'cancelled' | 'unsupported'> {
  try {
    if (window.showSaveFilePicker) {
      const file = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Видео MP4', accept: { 'video/mp4': ['.mp4'] } }],
      })
      const writer = await file.createWritable()
      await writer.write(blob)
      await writer.close()
      return 'saved'
    }
    const file = new File([blob], filename, { type: 'video/mp4' })
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file] })
      return 'shared'
    }
    return 'unsupported'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    throw error
  }
}
