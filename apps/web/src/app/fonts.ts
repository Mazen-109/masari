import localFont from 'next/font/local';

/*
 * IBM Plex Sans Arabic (OFL-1.1), self-hosted through `next/font/local` from the woff2 files of the pinned
 * `@fontsource/ibm-plex-sans-arabic` package (research.md §13, §17; DESIGN.md "Typography"). Next.js
 * copies the files to `/_next/static/media` with immutable caching (CSP `font-src 'self'`) and writes
 * the `@font-face` rules into the global CSS.
 *
 * Only two weights exist — 400 and 700 — and only the Arabic and Latin subsets. Every call names the
 * same family ('IBM Plex Sans Arabic'), so the faces form one family that `--font-sans` in globals.css
 * uses; the unicode ranges decide which file a character needs.
 *
 * Order matters: the browser consults the faces of a family last-declared first. The Arabic files also
 * contain the space and no-break space (U+0020, U+00A0), so the Arabic faces are declared after the
 * Latin ones and claim those two characters: the spaces of Arabic text no longer download a Latin file.
 *
 * Only the Arabic 400 file — the body text of every Arabic screen, and the language switch on English
 * screens — is preloaded. `adjustFontFallback` is off because its automatic fallback is Arial, which
 * has no Arabic; globals.css declares a metric-matched fallback instead. Font loader options must be
 * written as literals, so the ranges are repeated.
 *
 * Import this module for its side effect next to `globals.css` (every file that renders `<html>`):
 * importing it is enough for Next.js to add the `@font-face` rules and the preload to that route.
 */

const latinRegular = localFont({
  src: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal.woff2',
  weight: '400',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: "'IBM Plex Sans Arabic'" },
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    },
  ],
});

const latinBold = localFont({
  src: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-700-normal.woff2',
  weight: '700',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: "'IBM Plex Sans Arabic'" },
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    },
  ],
});

const arabicRegular = localFont({
  src: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2',
  weight: '400',
  display: 'swap',
  preload: true,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: "'IBM Plex Sans Arabic'" },
    {
      prop: 'unicode-range',
      value:
        'U+0020,U+00A0,U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC,U+102E0-102FB,U+10E60-10E7E,U+10EC2-10EC4,U+10EFC-10EFF,U+1EE00-1EEFF',
    },
  ],
});

const arabicBold = localFont({
  src: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2',
  weight: '700',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'font-family', value: "'IBM Plex Sans Arabic'" },
    {
      prop: 'unicode-range',
      value:
        'U+0020,U+00A0,U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC,U+102E0-102FB,U+10E60-10E7E,U+10EC2-10EC4,U+10EFC-10EFF,U+1EE00-1EEFF',
    },
  ],
});

/** The four faces, in declaration order. Pages need only the import, not this value. */
export const PLEX_FACES = [latinRegular, latinBold, arabicRegular, arabicBold];
