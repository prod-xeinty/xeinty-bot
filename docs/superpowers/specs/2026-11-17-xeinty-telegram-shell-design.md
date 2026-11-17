# XEINTY Telegram Shell Design

## Intent

Open a working XEINTY application inside Telegram as soon as possible, without a payment card or cloud database. This is the first technical step toward the bitmaker publishing tool described in the project brief.

## Scope

- A mobile-first React application that loads as a Telegram Mini App.
- Telegram WebApp bridge initialization, theme colors, user greeting, and a browser preview mode.
- A clear placeholder for the upcoming beat catalog and publishing workflow.
- Local development and production build commands.
- A free HTTPS deployment route and bot setup instructions.

## Later

Beat storage, publishing templates, video generation, analytics, authentication, and Appwrite are separate implementation stages. Their UI layout will follow this shell.

## Constraints and approach

Use Vite, React, and TypeScript, with Telegram's official WebApp script. Keep the initial app static, so it can be hosted for free without a backend. Do not trust Telegram user data for authorization until server-side `initData` verification exists. In a browser outside Telegram, show a preview rather than an error.

## Alternatives considered

- Full backend now: would delay opening the Mini App and needs cloud credentials.
- Static shell now: fastest path to a real Telegram launch; chosen for this stage.
- Bot-only UI: cannot become the intended publishing workspace.

## Success

`npm run build` succeeds, the app loads locally, and after HTTPS hosting and BotFather configuration, the same URL opens within Telegram and receives Telegram theme/user context.
