---
name: XEINTY
description: A monochrome music workspace for beatmakers
colors:
  canvas: "#0d0d0e"
  panel: "#1b1b1c"
  raised: "#303032"
  field: "#111112"
  light-panel: "#eeeeec"
  text: "#f4f4f2"
  secondary-text: "#a2a2a3"
  ink: "#141414"
typography:
  display:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "clamp(28px, 3vw, 36px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.045em"
  body:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "12px"
    fontWeight: 500
rounded:
  control: "10px"
  card: "18px"
  feature: "24px"
spacing:
  tight: "8px"
  regular: "16px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.light-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 16px"
---

## Overview

XEINTY feels like a compact music device: a nearly black workspace, one pale player surface, tactile graphite controls and monochrome project artwork. The design follows the user's reference image while keeping the actual beatmaker workflow and honest demo states.

## Colors

The canvas and work panels use a neutral graphite ramp. The light current-beat card and upload action carry the contrast. Text has three roles: near white for content, mid gray for supporting copy and dark ink on light surfaces. There are no colored glows or gradients.

## Typography

Manrope is used throughout, including Cyrillic headings, track names, labels and controls. Page titles are 27–36px and medium weight; sections are 16–22px. Small metadata is at least 11px, while mobile text inputs are 16px to avoid zoom and improve legibility.

## Layout

Desktop uses a 216px rail and a content column capped at 870px. Below 840px the rail disappears. Mobile uses a single column with 16px side padding and a floating three-item dock above Telegram safe-area insets. The order is current beat, work steps, new-bit action, recent projects.

## Elevation & Depth

Graphite surface steps and thin translucent borders create depth. The light player has a mild vertical tonal shift; tool tiles have restrained top highlights and shadows to suggest physical controls. Motion is limited to a short screen entrance and interaction feedback.

## Shapes

The light player has 24px corners, work panels 18–22px, small controls 9–12px. The project artwork has its own smaller radius within the player. Rounded shapes form a hierarchy, not a blanket pill treatment.

## Components

The featured player shows the current beat, a decorative demo waveform, an audio availability state and an action to open the beat. A disabled play control clearly communicates unavailable demo audio. Work tiles open the real Data, Publication and Links tabs. The upload action opens the working new-bit form. Recent projects remain a compact list rather than a grid of cards.

## Do's and Don'ts

- Keep sample data and local-only state explicit.
- Use a bright surface only for the current project or the main new-bit action.
- Keep controls meaningful and keyboard focus visible.
- Do not show fake statistics, pretend to publish to external services or make demo waveforms look like live playback.
