# Etude on a phone: "Score"

The phone-specific Score components remain available in the code, but the desktop app now selects the same content and desktop styling at every window size. Tailwind's viewport breakpoints are disabled, and the remaining screen-width-specific app styles are overridden in `web/src/desktop-layout.css`. No additional minimum window width is imposed. The language is called Score because Etude is a practice piece: titles are set like a score, the current place is marked in pink, and the counts carry their meaning in their shape.

`usePhone()` (`web/src/lib/phone.ts`) no longer selects alternate phone-only content. Existing phone components and styles are retained; this does not remove any content from the codebase.

## Legacy phone rules

- **Type.** Page titles are Computer Modern (`score-serif score-display`, ~36 px, regular weight with a hairline stroke so it holds on dark themes). Small labels are tracked caps (`score-kicker`). Everything else stays Inter.
- **Counts by shape.** New is an open ring, learning a half ring, due a filled dot (`Mark`, `Tally` in `components/phone-shell.tsx`). Zeros drop out of rows. Colour still follows the theme (`--new`, `--learn`, `--review`), so every theme works, but the shapes read without it.
- **One level at a time.** Decks shows the top level; a deck's page shows its subdecks. No indented trees on a phone.
- **Tap to open, hold for the rest.** Deck rows open on tap; press and hold (450 ms, `useLongPress`) opens an action sheet with Practice, Practice ahead, Rename, Move to…, Move up/down, Out one level, Make it a deck of its own. In Browse, holding a row starts selection; then taps select, and the bulk bar appears. No grips, ⋯ or checkboxes sit on rows by default.
- **Thumb zone.** Primary actions are 52 px pills at the bottom: Practice everything, Check, the four ratings, Go again / Next. Undo sits beside Check. Bury, suspend and edit move from the study header into a sheet behind ⋯.
- **Sheets, not menus.** `ActionSheet` is one rounded surface from the bottom: grab handle, serif title, a line of context, grouped rows. Swipe down or tap outside to close.
- **Navigation.** A floating capsule with four tabs (Decks, Browse, Stats, More) and the ε in its own disc beside it, which opens Ask Etude. Inactive tabs are icons only; the active one opens up into a pill with a pink icon and its name. The list scrolls under both behind a short fade. More holds Card types, Market, Settings, import and the update.
- **Titles fold.** `PhoneTitle` puts the big title in the page; when it scrolls away a slim bar fades in with the same title (and the back chevron on deck pages).
- **Toasts** sit at the bottom above the tab bar or the study controls.

## Retained phone components

| File | What |
|---|---|
| `web/src/lib/phone.ts` | `usePhone()` (below 768 px), `useLongPress()` |
| `web/src/components/phone-shell.tsx` | `PhoneTabBar`, `PhoneTitle`, `PhoneIconButton`, `ActionSheet`, `Tally`, `Mark` |
| `web/src/components/phone-decks.tsx` | Phone Decks: Today card, `DeckList` (also used for subdecks), rows |
| `web/src/pages/more.tsx` | The More tab (redirects to Settings on wide screens) |
| `web/src/index.css` | `score-*` utilities and classes |

Pages that keep their desktop structure on a phone (Stats, Settings, Market, Card types, deck Options/Manage) only take the serif title (`PHONE_H1`) and the safe-area padding.
