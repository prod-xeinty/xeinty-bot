import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import xeintyLogo from './assets/xeinty-logo.png'

type SplashPhase = 'intro' | 'exit' | 'done'

const splashTagline = 'Создавай свой звук'
const splashChars = Array.from(splashTagline)

export function SplashGate({ children }: { children: (ready: () => void) => React.ReactNode }) {
    const [phase, setPhase] = useState<SplashPhase>('intro')
    const [ready, setReady] = useState(false)
    const [introElapsed, setIntroElapsed] = useState(false)
    const markReady = useCallback(() => setReady(true), [])

    useEffect(() => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const minimum = window.setTimeout(() => setIntroElapsed(true), reduced ? 360 : 2100)
        const deadline = window.setTimeout(() => setReady(true), 12_000)
        return () => { window.clearTimeout(minimum); window.clearTimeout(deadline) }
    }, [])

    useEffect(() => {
        if (introElapsed && ready) setPhase('exit')
    }, [introElapsed, ready])

    useEffect(() => {
        if (phase !== 'exit') return
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const timer = window.setTimeout(() => setPhase('done'), reduced ? 160 : 420)
        return () => window.clearTimeout(timer)
    }, [phase])

    return <>
        <div hidden={phase === 'intro'}>{children(markReady)}</div>
        {phase !== 'done' && (
            <div
                className={`splash-screen ${phase === 'exit' ? 'splash-screen--exit' : ''}`}
                role="status"
                aria-label="Загружаем библиотеку XEINTY"
            >
                <div className="splash-frame" aria-hidden="true">
                    <span className="splash-corner splash-corner--tl" />
                    <span className="splash-corner splash-corner--tr" />
                    <span className="splash-corner splash-corner--bl" />
                    <span className="splash-corner splash-corner--br" />
                </div>

                <div className="splash-horizon" aria-hidden="true" />

                <svg
                    className="splash-waves"
                    viewBox="0 0 1440 360"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                >
                    <path
                        className="splash-wave splash-wave--1"
                        d="M0 180 C180 95 320 265 520 180 C700 104 860 258 1060 180 C1210 122 1330 220 1440 180"
                    />
                    <path
                        className="splash-wave splash-wave--2"
                        d="M0 180 C210 250 380 110 610 180 C820 244 980 118 1190 180 C1300 212 1380 152 1440 180"
                    />
                    <path
                        className="splash-wave splash-wave--3"
                        d="M0 180 C160 132 360 228 560 180 C760 132 940 226 1140 180 C1280 148 1370 202 1440 180"
                    />
                </svg>

                <div className="splash-core">
                    <div className="splash-emblem">
                        <img src={xeintyLogo} alt="XEINTY" width={300} height={300} decoding="sync" />
                    </div>
                    <p className="splash-tagline" aria-hidden="true">
                        {splashChars.map((char, index) => (
                            <span
                                key={index}
                                className="splash-char"
                                style={{ '--char-i': index } as CSSProperties}
                            >
                {char === ' ' ? '\u00A0' : char}
              </span>
                        ))}
                    </p>
                </div>

                <div className="splash-progress" aria-hidden="true">
                    <span className="splash-progress-fill" />
                </div>
            </div>
        )}
    </>
}
