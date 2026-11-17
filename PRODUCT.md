# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Bitmakers with finished beats. The first pilot is for the creator and roughly ten other bitmakers. Loopmaker and artist workflows are future scope.

## Product Purpose

XEINTY is a Telegram Mini App that helps a bitmaker prepare a finished beat for publication, then keep its publication links and available results together. The first useful workflow is: add a beat, fill its metadata, prepare editable Telegram and YouTube copy, make a static-cover video, publish manually, and return to the beat record.

## Operating Context

Users work on a phone inside Telegram as well as in a regular browser during development. A beat may have MP3 or WAV audio, cover art, title, BPM, musical key, tags, and links to Telegram and YouTube posts. The author edits content before sending it to either platform.

## Capabilities and Constraints

- Current deployed version is a static React/TypeScript shell on GitHub Pages at `https://prod-xeinty.github.io/xeinty-bot/`.
- Beats, audio, cover files, copy, and links are stored in IndexedDB on the current device. There is no cloud database, cross-device sync, or authenticated write access. Clearing Telegram/browser website data may remove local beats.
- Local static-cover MP4 export is available. The creator confirmed generation and saving in Telegram Desktop and saving on iPhone; Android and large WAV files still need testing.
- The interface may demonstrate workflows locally, but must clearly distinguish demonstration data from saved user data.
- No payment card or paid infrastructure is available for the pilot.
- Telegram user data read in the browser is display-only until a server verifies `initData`.
- The product focuses on manual publication; automatic posting, mailing, TikTok, Genius tracking, stems, and sessions are later work.

## Brand Commitments

The product name is XEINTY, after the creator's nickname. The user wants a beautiful, modern, structured interface with clear actions and smooth animation.

## Evidence on Hand

The repository has a functional Telegram Mini App shell. No real bit audio, covers, or titles have been supplied for the interface yet; examples must be labeled as demonstration content.

## Product Principles

- Put the beat and the next action ahead of abstract dashboard metrics.
- Make every publishing step editable and reversible.
- Keep source, status, and time visible for any future statistic.
- Make the mobile workflow usable with one hand in Telegram.
