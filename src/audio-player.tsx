import { useRef, useState, type ReactNode } from 'react'
import { Pause, Play, Repeat, RotateCcw, RotateCw, Volume2, VolumeX, X } from 'lucide-react'

type Track = { id: string; title: string; audioUrl?: string }

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return minutes + ':' + String(Math.floor(seconds % 60)).padStart(2, '0')
}

export function useAudioPlayer(notify: (message: string) => void) {
  const media = useRef<HTMLAudioElement>(null)
  const source = useRef<{ id: string; url: string } | null>(null)
  const [trackId, setTrackId] = useState<string>()
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [repeat, setRepeat] = useState(false)

  function toggle(track: Track) {
    const audio = media.current
    if (!audio || !track.audioUrl) return
    if (source.current?.id === track.id && source.current.url === track.audioUrl && !audio.paused) {
      audio.pause()
      return
    }
    if (source.current?.id !== track.id || source.current.url !== track.audioUrl) {
      source.current = { id: track.id, url: track.audioUrl }
      setElapsed(0)
      setDuration(0)
      setPlaying(false)
      audio.src = track.audioUrl
    }
    setTrackId(track.id)
    const requested = source.current
    void audio.play().catch((error: unknown) => {
      if (source.current === requested && (!(error instanceof DOMException) || error.name !== 'AbortError') && !audio.error) {
        notify('Не удалось воспроизвести аудио. Попробуй ещё раз.')
      }
    })
  }

  function close() {
    source.current = null
    const audio = media.current
    audio?.pause()
    audio?.removeAttribute('src')
    audio?.load()
    setTrackId(undefined)
    setPlaying(false)
    setElapsed(0)
    setDuration(0)
  }

  function seek(seconds: number) {
    const audio = media.current
    if (!audio || !Number.isFinite(audio.duration)) return
    audio.currentTime = Math.min(audio.duration, Math.max(0, seconds))
    setElapsed(audio.currentTime)
  }

  function changeVolume(level: number) {
    if (!media.current) return
    media.current.volume = level
    if (level > 0) media.current.muted = false
    setVolume(media.current.volume)
    setMuted(media.current.muted)
  }

  function toggleMute() {
    if (!media.current) return
    if (volume === 0) { changeVolume(1); return }
    media.current.muted = !media.current.muted
    setMuted(media.current.muted)
  }

  const element = <audio ref={media} preload="metadata" loop={repeat}
    onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
    onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
    onPlay={() => { if (source.current) setPlaying(true) }}
    onPause={() => setPlaying(false)}
    onEnded={() => setPlaying(false)}
    onError={() => { if (source.current) { setPlaying(false); notify('Не удалось загрузить аудио для воспроизведения.') } }}
  />

  return {
    element, trackId, playing, duration, elapsed, muted, volume, repeat,
    toggle, close, seek, changeVolume, toggleMute, toggleRepeat: () => setRepeat((current) => !current),
  }
}

type AudioPlayer = ReturnType<typeof useAudioPlayer>

export function AudioDock({ player, track, cover }: { player: AudioPlayer; track: Track; cover: ReactNode }) {
  const { playing, elapsed, duration, muted, volume, repeat } = player
  const progress = duration > 0 ? Math.min(elapsed / duration, 1) : 0
  return <section className="audio-dock" aria-label="Аудиоплеер">
    <div className="audio-dock-track">
      {cover}
      <div><span>Сейчас в плеере</span><strong title={track.title}>{track.title}</strong></div>
    </div>
    <div className="audio-dock-transport">
      <button type="button" onClick={() => player.seek(elapsed - 10)} disabled={!duration} aria-label="На 10 секунд назад" title="−10 секунд"><RotateCcw size={17} /></button>
      <button type="button" className="player-play" onClick={() => player.toggle(track)} aria-label={playing ? 'Пауза' : 'Продолжить'}><PlayPauseIcon playing={playing} /></button>
      <button type="button" onClick={() => player.seek(elapsed + 10)} disabled={!duration} aria-label="На 10 секунд вперёд" title="+10 секунд"><RotateCw size={17} /></button>
    </div>
    <div className="audio-dock-options">
      <button type="button" aria-pressed={repeat} onClick={player.toggleRepeat} aria-label="Повтор трека" title="Повтор трека"><Repeat size={17} /></button>
      <button type="button" onClick={player.toggleMute} aria-label={muted || volume === 0 ? 'Включить звук' : 'Выключить звук'}>
        {muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
      </button>
      <input className="audio-dock-volume" type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} aria-label="Громкость" onChange={(event) => player.changeVolume(event.target.valueAsNumber)} />
      <button type="button" onClick={player.close} aria-label="Закрыть плеер" title="Закрыть"><X size={18} /></button>
    </div>
    <div className="audio-dock-progress">
      <time>{formatTime(elapsed)}</time>
      <input type="range" min={0} max={duration || 1} step="any" value={Math.min(elapsed, duration)} disabled={!duration}
        aria-label="Позиция воспроизведения" aria-valuetext={formatTime(elapsed) + ' из ' + formatTime(duration)}
        style={{ background: 'linear-gradient(to right, #eee ' + progress * 100 + '%, #666 ' + progress * 100 + '%)' }}
        onChange={(event) => player.seek(event.target.valueAsNumber)} />
      <time>{formatTime(duration)}</time>
    </div>
  </section>
}

export function PlayPauseIcon({ playing }: { playing: boolean }) {
  return playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />
}
