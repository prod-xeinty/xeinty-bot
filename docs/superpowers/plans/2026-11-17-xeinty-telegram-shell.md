# XEINTY Telegram Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a static XEINTY Telegram Mini App that builds locally and is ready for free HTTPS hosting.

**Architecture:** Vite serves a React/TypeScript single-page app. A small Telegram adapter initializes WebApp and exposes user/theme state while allowing browser preview.

**Tech Stack:** React, TypeScript, Vite, Telegram WebApp API.

**Spec:** `docs/superpowers/specs/2026-11-17-xeinty-telegram-shell-design.md`

## Global Constraints

- No card or paid service.
- No backend credentials in client code.
- Mobile-first and usable outside Telegram for preview.

## Review Focus

- Telegram script absent: browser preview still renders.
- Telegram user missing: generic greeting renders.
- Theme changes: colors update without reloading.
- Narrow phone: content does not overflow horizontally.
- Production build: assets work under a configurable base path.

---

### Task 1: Static application scaffold

**Files:** `package.json`, `index.html`, `vite.config.ts`, `tsconfig*.json`, `src/main.tsx`, `src/App.tsx`, `src/telegram.ts`, `src/styles.css`, `README.md`

**Interfaces:** `getTelegramWebApp()` returns the optional WebApp bridge; `App` renders the shell.

- [ ] Create Vite/React/TypeScript configuration and install dependencies.
- [ ] Implement Telegram initialization and browser preview fallback.
- [ ] Implement a compact mobile shell with a working Telegram context indicator.
- [ ] Run `npm run build` and inspect the page in a browser.

### Task 2: Launch path

**Files:** `README.md`, deployment configuration if available.

**Interfaces:** Public HTTPS URL for BotFather configuration once a hosting target exists.

- [ ] Document free hosting and BotFather setup with exact user actions.
- [ ] If a connected account permits deployment, publish and verify the HTTPS URL.
