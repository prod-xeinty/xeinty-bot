---
name: XEINTY
description: Dark music studio for beatmakers
colors:
  canvas: "#151520"
  surface: "#211f2c"
  field: "#171722"
  text: "#f3f0f4"
  muted: "#a6a2b3"
  lilac: "#a999df"
  lilac-hover: "#c5b5f3"
  peach: "#e6aa85"
typography:
  display:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "clamp(54px, 5.2vw, 76px)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.075em"
  track:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "clamp(46px, 5.5vw, 80px)"
    fontWeight: 800
    lineHeight: 0.9
  body:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  control: "9px"
  panel: "15px"
  feature: "19px"
spacing:
  tight: "8px"
  regular: "16px"
  section: "42px"
components:
  button-primary:
    backgroundColor: "{colors.lilac}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 18px"
  button-primary-hover:
    backgroundColor: "{colors.lilac-hover}"
---

## Overview

XEINTY uses a dark, quiet studio canvas with luminous violet and warm peach accents. Abstract covers carry the strongest color. The interface groups work into distinct rounded panels and keeps the next action visible. The visuals are informed by the supplied dark music-player and dashboard references.

## Colors

Canvas and field surfaces are deep navy-violet. Lilac marks primary actions and selected navigation. Peach is a small highlight in artwork and brand details. White is reserved for titles and important values; supporting copy is muted violet-gray.

## Typography

Manrope is used for Cyrillic headings, labels, body text and controls. Barlow Condensed is used for Latin track titles and the XEINTY wordmark. Large headings are dense and tightly tracked; body copy stays compact but legible.

## Layout

The main desktop area has a 230px side rail and a flexible content column inside a 1320px frame. At 900px the rail disappears. At 600px the app becomes a single column with a fixed bottom navigation that respects Telegram safe-area insets. The library feature moves from a side-by-side cover and details to a stacked card.

## Elevation & Depth

Depth comes from violet radial light, translucent gradient panels, fine light borders and soft dark shadows. A mild backdrop blur is used on panels and mobile navigation. Keep controls visually quieter than the cover art.

## Shapes

Panels use 15–19px corners, controls 7–9px corners, and status labels are pills. Cover artwork is clipped to the card. Avoid sharp rectangular feature panels.

## Components

The primary button is lilac with dark text and a short hover lift. Beat rows use artwork, title, tags, BPM/key and a right arrow. Publication cards use platform labels, editable text and copy actions. Forms use dark inset fields with a visible lilac keyboard focus ring.

## Do's and Don'ts

- Keep demo records clearly identified and future integrations marked as future work.
- Use motion for page entry, hover feedback and soft ambient light; respect reduced-motion settings.
- Keep each screen focused on one task and preserve generous space around the main artwork.
- Do not imply that audio, links or edits are stored remotely until a backend is connected.
