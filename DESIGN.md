---
name: Masari
description: Calm, Arabic-first working tools for an Egyptian college — students, faculty, Student Affairs, administration.
colors:
  background: '#FBFAF7'
  surface: '#FFFFFF'
  muted: '#F1EFE9'
  foreground: '#18212B'
  muted-foreground: '#525C69'
  primary: '#0E5A5C'
  primary-hover: '#0A4547'
  primary-foreground: '#FFFFFF'
  primary-soft: '#E3EFEE'
  primary-soft-foreground: '#0A4547'
  danger: '#B3261E'
  danger-hover: '#8C1D17'
  danger-foreground: '#FFFFFF'
  danger-soft: '#FBEAE8'
  danger-soft-foreground: '#8C1D17'
  success: '#1D6A3A'
  success-soft: '#E6F2EA'
  warning: '#8A4B00'
  warning-soft: '#FBF0DF'
  border: '#DDD8CE'
  input: '#7B828C'
  ring: '#0E5A5C'
typography:
  display:
    fontFamily: "'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', Tahoma, 'Noto Sans Arabic', 'Geeza Pro', sans-serif"
    fontSize: '2.25rem'
    fontWeight: 700
    lineHeight: 1.4
  headline:
    fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif"
    fontSize: '1.875rem'
    fontWeight: 700
    lineHeight: 1.45
  title:
    fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif"
    fontSize: '1.25rem'
    fontWeight: 600
    lineHeight: 1.6
  body:
    fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif"
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: '0em'
  label:
    fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif"
    fontSize: '0.875rem'
    fontWeight: 500
    lineHeight: 1.7
rounded:
  sm: '4px'
  md: '6px'
  lg: '8px'
  xl: '12px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
  xl: '48px'
  2xl: '64px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    rounded: '{rounded.md}'
    padding: '8px 20px'
    height: '44px'
  button-primary-hover:
    backgroundColor: '{colors.primary-hover}'
  button-secondary:
    backgroundColor: '{colors.primary-soft}'
    textColor: '{colors.primary-soft-foreground}'
    rounded: '{rounded.md}'
    height: '44px'
  button-outline:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    height: '44px'
  button-destructive:
    backgroundColor: '{colors.danger}'
    textColor: '{colors.danger-foreground}'
    rounded: '{rounded.md}'
    height: '44px'
  button-destructive-hover:
    backgroundColor: '{colors.danger-hover}'
  public-header:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.primary}'
    height: '64px'
---

# Design System: Masari

<!--
Created by feature 001 PR-8 (task T034, research.md §22). Token values are implemented in
apps/web/src/app/globals.css (Tailwind 4 `@theme`); change both together. Light theme only.
-->

## Overview

**Creative North Star: "The well-kept college register."** Masari is a set of working tools (Impeccable
mode **Operate**): forms, lists, settings, and dashboards that students open between lectures and staff
use all day. The interface is quiet paper and ink with one deep teal for action — the colour of a
trustworthy official stamp, not of a startup. Precision shows in the details: generous Arabic line
height, honest focus rings, 44 px targets, numbers that line up. Nothing decorates; everything helps
someone finish a task.

- Arabic first: every screen is designed and checked right-to-left before left-to-right.
- One family for both scripts (IBM Plex Sans Arabic), so mixed Arabic/English text stays harmonious.
- Calm, academic tone: no gradients, no stock photos, no mascots, no glass, no decorative shadows.

## Colors

All text/background pairs below meet WCAG 2.1 AA. Ratios are WCAG relative-luminance contrast, computed
from the hex values above; required minimum in brackets (4.5:1 normal text, 3:1 large text and UI parts).

### Primary

- **Deep teal** (`primary` #0E5A5C): primary buttons, links, the wordmark, the language switch, the
  focus ring. One action colour per screen region; never used for large tinted areas.
- **Deep teal, pressed** (`primary-hover` #0A4547): hover/active state of primary buttons.
- **Teal wash** (`primary-soft` #E3EFEE) with `primary-soft-foreground` #0A4547: secondary buttons,
  selected rows, text selection.

### Neutral

- **Paper** (`background` #FBFAF7): the page.
- **White sheet** (`surface` #FFFFFF): header, cards, inputs.
- **Shaded paper** (`muted` #F1EFE9): hover of quiet controls, table header rows.
- **Ink** (`foreground` #18212B): all body text and headings.
- **Pencil** (`muted-foreground` #525C69): secondary text, hints, metadata.
- **Rule line** (`border` #DDD8CE): dividers and card outlines only — decorative, never the only boundary
  of a control.
- **Control edge** (`input` #7B828C): borders of inputs, selects, checkboxes, outline buttons.

### Status

- **Danger** (`danger` #B3261E, `danger-hover` #8C1D17, `danger-soft` #FBEAE8 with
  `danger-soft-foreground` #8C1D17): destructive actions, field errors, error summaries.
- **Success** (`success` #1D6A3A on `success-soft` #E6F2EA) and **Warning** (`warning` #8A4B00 on
  `warning-soft` #FBF0DF): status text and banners. Status is never shown by colour alone — always with
  words (and an icon when icons arrive).

### Contrast of every pair in use

| Foreground                      | Background            | Ratio          | Use                                          |
| ------------------------------- | --------------------- | -------------- | -------------------------------------------- |
| foreground #18212B              | background #FBFAF7    | 15.58:1 [4.5]  | body text on the page                        |
| foreground #18212B              | surface #FFFFFF       | 16.26:1 [4.5]  | text on header, cards, inputs                |
| foreground #18212B              | muted #F1EFE9         | 14.14:1 [4.5]  | text on hover/quiet areas                    |
| foreground #18212B              | primary-soft #E3EFEE  | 13.82:1 [4.5]  | selected text                                |
| muted-foreground #525C69        | background #FBFAF7    | 6.50:1 [4.5]   | secondary text                               |
| muted-foreground #525C69        | surface #FFFFFF       | 6.79:1 [4.5]   | hints in cards/forms                         |
| muted-foreground #525C69        | muted #F1EFE9         | 5.90:1 [4.5]   | metadata on shaded rows                      |
| primary #0E5A5C                 | background #FBFAF7    | 7.63:1 [4.5]   | links on the page                            |
| primary #0E5A5C                 | surface #FFFFFF       | 7.97:1 [4.5]   | wordmark, language switch, skip link         |
| primary #0E5A5C                 | muted #F1EFE9         | 6.93:1 [4.5]   | links on shaded rows                         |
| primary-foreground #FFFFFF      | primary #0E5A5C       | 7.97:1 [4.5]   | primary button                               |
| primary-foreground #FFFFFF      | primary-hover #0A4547 | 10.74:1 [4.5]  | primary button, hover                        |
| primary-soft-foreground #0A4547 | primary-soft #E3EFEE  | 9.13:1 [4.5]   | secondary button                             |
| danger-foreground #FFFFFF       | danger #B3261E        | 6.54:1 [4.5]   | destructive button                           |
| danger-foreground #FFFFFF       | danger-hover #8C1D17  | 9.12:1 [4.5]   | destructive button, hover                    |
| danger #B3261E                  | background #FBFAF7    | 6.26:1 [4.5]   | field error text                             |
| danger #B3261E                  | surface #FFFFFF       | 6.54:1 [4.5]   | error text in cards/forms                    |
| danger-soft-foreground #8C1D17  | danger-soft #FBEAE8   | 7.83:1 [4.5]   | error summary banner                         |
| success #1D6A3A                 | background #FBFAF7    | 6.34:1 [4.5]   | success text                                 |
| success #1D6A3A                 | success-soft #E6F2EA  | 5.75:1 [4.5]   | success banner                               |
| warning #8A4B00                 | background #FBFAF7    | 6.52:1 [4.5]   | warning text                                 |
| warning #8A4B00                 | warning-soft #FBF0DF  | 6.04:1 [4.5]   | warning banner                               |
| input #7B828C                   | surface #FFFFFF       | 3.88:1 [3, UI] | input and outline-button borders             |
| input #7B828C                   | background #FBFAF7    | 3.72:1 [3, UI] | controls placed on the page                  |
| ring #0E5A5C                    | background #FBFAF7    | 7.63:1 [3, UI] | focus ring (2 px offset puts it on the page) |
| ring #0E5A5C                    | surface #FFFFFF       | 7.97:1 [3, UI] | focus ring inside cards/header               |
| ring #0E5A5C                    | muted #F1EFE9         | 6.93:1 [3, UI] | focus ring on shaded rows                    |

`border` #DDD8CE on `background` is 1.36:1 and is used only for decorative dividers, which WCAG does not
require to contrast. Disabled controls (50 % opacity) are exempt from contrast requirements and are also
marked `disabled` for assistive technology.

### Named Rules

- **The One Ink Rule.** Text is `foreground` or `muted-foreground`; colour in text means a link or a
  status. Never grey text on a coloured surface — use that surface's `-foreground` token.
- **The Token-Only Rule.** Tailwind's default palette is removed in `globals.css`; a colour that is not a
  token does not exist. Restyle by editing tokens, never with one-off values.
- **The Underlined-Link Rule.** A link inside running text (`p`, `li`, `dd`, `td`, `th`, `blockquote`,
  `figcaption`, `label`, `small`) is `primary` **and underlined** — the base style in `globals.css`
  does it. `primary` against `foreground` text is only about 2:1, so colour alone would not mark the
  link (WCAG 1.4.1; axe `link-in-text-block`). Stand-alone links (navigation, the wordmark, the
  language switch, button-styled links) carry their own classes and may drop the underline.

## Typography

**IBM Plex Sans Arabic** (OFL-1.1) covers Arabic and Latin in one family; weights 400, 500, 600, 700 are
self-hosted from `@fontsource/ibm-plex-sans-arabic` (no font CDN; `unicode-range` subsets mean English
pages do not download Arabic glyphs). Fallback: `system-ui, -apple-system, 'Segoe UI', Tahoma,
'Noto Sans Arabic', 'Geeza Pro', sans-serif`.

### Hierarchy

| Role                      | Utility     | Size  | Weight    | Line height ar / en |
| ------------------------- | ----------- | ----- | --------- | ------------------- |
| Display (page hero, rare) | `text-4xl`  | 36 px | 700       | 1.4 / 1.2           |
| Headline (page `<h1>`)    | `text-3xl`  | 30 px | 700       | 1.45 / 1.25         |
| Section (`<h2>`)          | `text-2xl`  | 24 px | 600       | 1.5 / 1.35          |
| Title (card, dialog)      | `text-xl`   | 20 px | 600       | 1.6 / 1.4           |
| Lead                      | `text-lg`   | 18 px | 400       | 1.7 / 1.6           |
| Body                      | `text-base` | 16 px | 400       | 1.7 / 1.6           |
| Label, hint, table        | `text-sm`   | 14 px | 500 / 400 | 1.7 / 1.5           |

Nothing smaller than 14 px: `text-xs` is removed from the theme. Form inputs are at least 16 px (smaller text makes mobile browsers zoom).
Headings use `text-balance`; body text is limited to about 60–75 characters per line.

### Named Rules (Arabic)

- **The Joined-Letters Rule.** No letter-spacing and no italics on Arabic text — they break letter
  joining. `globals.css` forces `letter-spacing: 0` on `:lang(ar)` and turns `em`/`i` upright; emphasis
  comes from weight (600/700).
- **The Tall-Line Rule.** Arabic body text uses line height 1.7 (set per size on `html:lang(ar)`), so
  diacritics and descenders never collide.
- **The Isolation Rule.** Emails, URLs, student codes, and slugs inside Arabic text are wrapped in
  `dir="ltr"` or `<bdi>`; inputs for them carry `dir="ltr"`.
- **Western digits** in both languages, formatted only through `apps/web/src/lib/format.ts`.

## Layout

- **RTL first, logical only.** Only logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`,
  `text-start`, `text-end`, `rounded-s-`, `border-s-`); `pnpm rtl:check` fails CI on physical ones,
  including arbitrary properties such as `[margin-left:4px]`. Directional icons are mirrored in RTL.
  The pinned Tailwind (4.3.5) also has `inset-s-*` / `inset-e-*`; `start-*` / `end-*` are not marked
  deprecated there, so the check keeps suggesting them.
- **`rtl-ok:` exemption.** The check reads class-like words anywhere on a line, so prose such as
  "right-to-left" or a locale tag like `pl-PL` in a comment or string is flagged. Reword it, or add
  `rtl-ok: <reason>` to that line (the reason must start with a letter or digit). Use the marker also
  for a genuinely physical need, for example a chart axis that is always left-to-right — and say why.
- **Spacing rhythm** on Tailwind's 4 px grid: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 px. Tight inside a
  group (8–12), generous between groups (24–48), more space above a heading than below it.
- **Container:** content and header share `max-w-5xl` (64 rem) centred, with 16 px side padding on phones
  and 24 px from 640 px. Signed-in screens widen the shared container to `max-w-7xl` (80 rem) to fit the
  16 rem sidebar beside the same `max-w-5xl` content column.
- **Breakpoints:** Tailwind defaults; designed at 320 px first. No horizontal scrolling at 320 px; usable
  at 200 % zoom. Signed-in navigation is a sidebar from 1024 px and a drawer below.
- **Touch targets:** every interactive element is at least 44 × 44 px (`min-h-11` / `size-11`).

## Elevation & Depth

Flat by default: surfaces separate by colour (`background` → `surface`) and `border` rule lines, not by
shadow. The only shadow is Tailwind's soft `shadow-md` on floating layers (skip link when visible, menus,
dialogs), always with an offset and blur. No coloured glows, no hard offset shadows, no glass.

## Shapes

Gently rounded, never pill-shaped: `rounded-sm` 4 px (badges), `rounded-md` 6 px (buttons, inputs,
focusable links), `rounded-lg` 8 px (cards, banners), `rounded-xl` 12 px (dialogs). Corners that differ by
side use logical utilities (`rounded-s-*`, `rounded-e-*`).

## Components

### Focus ring

Every focusable element shows a **2 px solid `ring` outline with a 2 px offset** on `:focus-visible`
(global rule in `globals.css`). Components never remove it; they may only restyle it with tokens.
The only exception is the skip link's target, `<main tabindex="-1">` (rule
`main[tabindex='-1']:focus`): it is a landmark, not a control. Other `tabindex="-1"` elements, such as
roving-tabindex menu, tab, and radio items, keep the ring.

### Buttons

`apps/web/src/components/ui/button.tsx` (shadcn/ui, adapted). Variants: `primary` (one per form or
region), `secondary` (teal wash), `outline` (`input` border on `surface`), `ghost`, `destructive`,
`link`. Sizes: `default` (min 44 px high, 20 px inline padding), `lg` (48 px), `icon` (44 × 44 px).
Medium weight (500), 16 px text, colour-only transitions (150 ms), disabled at 50 % opacity; `aria-disabled` (a submit button while its form is sent) at 70 % with a
not-allowed cursor, still focusable. `asChild`
renders a link with button styling. A `<button>` defaults to `type="button"`; submit buttons say
`type="submit"`.

### shadcn/ui components

Components are copied into `apps/web/src/components/ui` when first needed and adapted. `components.json`
sets `"rtl": true`, and every copied file must pass `pnpm rtl:check`. shadcn's colour names are aliases
of Masari tokens (`@theme inline` in `globals.css`), so copied components keep their colours; new code
uses the Masari names.

| shadcn name                             | Masari token                              |
| --------------------------------------- | ----------------------------------------- |
| `background`, `foreground`              | same names                                |
| `primary`, `primary-foreground`         | same names                                |
| `muted`, `muted-foreground`             | same names                                |
| `border`, `input`, `ring`               | same names                                |
| `card`, `popover`                       | `surface`                                 |
| `card-foreground`, `popover-foreground` | `foreground`                              |
| `secondary`, `secondary-foreground`     | `primary-soft`, `primary-soft-foreground` |
| `accent`, `accent-foreground`           | `muted`, `foreground`                     |
| `destructive`, `destructive-foreground` | `danger`, `danger-foreground`             |

When `shadcn add` writes variables or `oklch` colours into `globals.css` (`:root { --background: … }`),
revert those lines: the tokens above are the only source of colour.

### Navigation

- **Skip link** (`components/shell/skip-link.tsx`): the first focusable element of every screen; hidden
  until focused, then shown at the top inline-start corner on `surface` with `primary` text; moves focus
  to `<main id="main">`.
- **Public header** (`components/shell/public-header.tsx`): white `surface` band with a bottom rule line,
  64 px high; the wordmark (app name in the current language, 24 px bold, `primary`) at the start links
  home; the language switch at the end is written in the target language with its own `lang`/`dir`.
- **Signed-in shell** (`components/shell/app-header.tsx`, `app-sidebar.tsx`, `mobile-nav.tsx`,
  `user-menu.tsx`): the header band is the public header plus the college name (`muted-foreground`;
  on its own line below 640 px), and a user menu (account icon, name from 640 px) at the end. Header and
  body share `max-w-7xl`: from 1024 px a 16 rem sidebar (rule line at its inline end) sits beside a
  `max-w-5xl` main column; below 1024 px a ghost icon button at the start of the header opens the same
  entries in a drawer (sheet) from the inline-start edge. Entries are 44 px rows with an icon and the
  name; the current one has `aria-current="page"` and the selected-row colours (`primary-soft` /
  `primary-soft-foreground`). Without JavaScript the sidebar shows at every width and a plain sign-out
  button replaces the user menu (Tailwind `noscript:`).
- **Menus and drawers** (`components/ui/dropdown-menu.tsx`, `sheet.tsx`, Radix): `surface` panels with a
  rule line and `shadow-md`; menu items 44 px with the `muted` highlight; the drawer overlay is
  `foreground` at 40 %. No animation library. Focus is trapped while open, Escape closes, and focus
  returns to the trigger.
- **Module cards** (`features/dashboard/components/module-card.tsx`): a card with the module icon on a
  `primary-soft` tile, a "coming soon" badge (`components/ui/badge.tsx`, `rounded-sm`, soft fill with
  its `-foreground` token), the name as an `<h2>` link whose hit area covers the card (border turns
  `primary` on hover/focus), and the one-sentence description. Directional arrows mirror in Arabic
  (`rtl:-scale-x-100`).

### Inputs / Fields

`components/ui/{input,select,checkbox,label}.tsx` and `components/forms/field.tsx`: visible label above
the control (14 px, medium), `input` border, `surface` fill, 44 px minimum height, 16 px text; an invalid
control gets a `danger` border and `aria-invalid`, and the error text in `danger` below the field is
linked by `aria-describedby` (error first, then the hint in `muted-foreground`). Checkboxes and selects
are the native elements styled with tokens (no Radix), so every form works without JavaScript; a checkbox
field puts the control before its label on one 44 px row. The form-level error summary
(`components/forms/form-error.tsx`) is an `Alert` with `role="alert"` on `danger-soft`; banners use
`rounded-lg` and a soft status fill with the matching text token from the contrast table:
`primary-soft-foreground` on `primary-soft` (info), `danger-soft-foreground` on `danger-soft` (error),
`success` on `success-soft`, and `warning` on `warning-soft`. The submit button
(`components/forms/submit-button.tsx`) says it is busy while the form is sent and stays focusable.

## Do's and Don'ts

### Do:

- Do design the Arabic screen first, then check the English one.
- Do use tokens (`bg-primary`, `text-muted-foreground`, `border-input`) and logical utilities only.
- Do keep one primary action per region and name it with a verb («حفظ», "Save").
- Do pair every status colour with words.

### Don't:

- Don't letter-space or italicise Arabic, and don't let an image model render Arabic text.
- Don't use gradients, stock imagery, glassmorphism, coloured glows, or eyebrow labels above headings.
- Don't put grey text on coloured backgrounds or use `border` as a control's only edge.
- Don't add a dark theme or a new colour without updating this file and `globals.css` together.
