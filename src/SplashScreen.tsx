import { useEffect, useRef, useState, type CSSProperties } from 'react'
import xeintyLogo from './assets/xeinty-logo.png'
import { getTelegramWebApp } from './telegram'

type SplashPhase = 'intro' | 'exit' | 'done'

const splashTagline = 'Создавай свой звук'
const splashChars = Array.from(splashTagline)

export function SplashGate({ children }: { children: React.ReactNode }) {
    const [phase, setPhase] = useState<SplashPhase>('intro')
    const skipTimerRef = useRef<number | null>(null)

    useEffect(() => {
        const webApp = getTelegramWebApp()
        if (webApp) {
            webApp.setHeaderColor?.('#0c0c0e')
            webApp.setBackgroundColor?.('#0c0c0e')
            webApp.ready()
        }

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const holdMs = reduced ? 360 : 1750
        const exitMs = reduced ? 160 : 420

        const exitTimer = window.setTimeout(() => setPhase('exit'), holdMs)
        const doneTimer = window.setTimeout(() => setPhase('done'), holdMs + exitMs)
        return () => {
            window.clearTimeout(exitTimer)
            window.clearTimeout(doneTimer)
            if (skipTimerRef.current) window.clearTimeout(skipTimerRef.current)
        }
    }, [])

    function skipSplash() {
        if (phase !== 'intro') return
        setPhase('exit')
        skipTimerRef.current = window.setTimeout(() => setPhase('done'), 320)
    }

    return <>
        {phase !== 'intro' && children}
        {phase !== 'done' && (
            <div
                className={`splash-screen ${phase === 'exit' ? 'splash-screen--exit' : ''}`}
                role="status"
                aria-label={splashTagline}
                onClick={skipSplash}
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
