# Gatebook interface

## Mode and setting

Operate: a single event operator checks people in on a phone or tablet at a venue where connectivity
may be poor. The screen needs to remain readable in bright indoor light and quick to use with one
hand.

## Visual world

The interface borrows the material grammar of an admission-desk ticket wallet: cool paper, deep
navy ink, fine ruled fields, perforated roster dividers, and clear stamp-like attendance states.
The treatment stays functional rather than turning attendee rows into decorative ticket art.

## Palette and type

- Ground: `#f3f5f7`; paper: `#ffffff`; ink: `#18263d`; supporting ink: `#32425a`.
- Here: forest green `#24583f` / pale green `#e8f4ec`.
- Not here: vermilion `#c6453d` / pale red `#fff0ed`.
- Undecided: neutral paper and ink; do not imply a status through color alone.
- Warm amber is reserved for earlier-register guidance and destructive replacement warnings.
- Use the platform system sans stack for familiarity and reliable offline rendering. Use tabular
  numerals for attendance counts.

## Composition and behavior

The event and active register lead; a compact attendance tally and resolution bar follow. Roster
tools, name/email search, and the attendee queue come next. Each attendee is a ruled row with
independent Here and Not here controls; pressing the active status clears it back to undecided.
Register history is a task-level dialog, while the roster remains the main surface.

Expected, Here, Not here, and Still to decide totals are scoped to the current register's selected
column values. Text search and the earlier-absence view only narrow the visible list, never the
totals. Each completed register retains its expected-roster snapshot and all three outcomes.

## Responsive and accessible behavior

The layout supports narrow 320px screens through tablet widths. Controls target at least 44px touch
height, labels remain visible with status colors, and focus states are explicit. Long rosters render
in bounded pages. Dialogs use native modal semantics; reduced-motion preferences are respected.
