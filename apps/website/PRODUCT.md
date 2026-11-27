# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One event operator using a Xiaomi Android phone or an iPad to check people in at a venue, including places with unreliable internet.

## Product Purpose

Help an operator find attendees quickly and mark them present without depending on an internet connection during the event.

## Positioning

A device-local check-in tool that imports the operator's Excel roster, filters it by multiple values in any chosen column, and keeps the roster and attendance records on that device.

## Operating Context

The operator imports a mostly static master roster from an `.xlsx` workbook, searches by attendee name or email, optionally narrows it by one roster column, and checks people in from a touch screen. The same operator manages the device and event.

## Capabilities and Constraints

- The app is an installable progressive web app rather than a native app.
- Spreadsheet parsing, roster edits, event state, and exports stay on the device; there is no account or synchronization.
- The app must be loaded online once before it can be used offline.
- The master roster should remain intact when starting a new event.
- An event day can include multiple labelled registers; each completed register's attendance snapshot must remain available so staff can identify people absent earlier.
- At each register, show expected, checked-in, and explicitly not-here totals. Expected follows the selected roster-column values; text search only narrows the visible list.
- The operator needs to add, edit, or remove attendees and back up or export event data.

## Evidence on Hand

No sample attendee workbook or event data is provided in the repository. The operator supplies their own `.xlsx` file.

## Product Principles

- Keep check-in reliable when connectivity is absent.
- Make finding and marking one attendee quick and unambiguous.
- Keep imported roster data and event attendance under the operator's control.
- Make resets and data replacement explicit, and make backups easy to find.
