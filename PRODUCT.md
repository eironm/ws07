# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Finance; Tracker is designed first for a college student living on an allowance. The allowance is a set amount on a schedule, such as ₱1,500 every Monday or a monthly amount on a set day, plus occasional top-ups that stretch it (relatives, gifts, part-time pay). The student pays many small amounts a day in cash and by e-wallet: jeepney fares, canteen meals, convenience-store runs, load. The money often runs out before the next allowance arrives.

They log a payment on the phone at the counter or right after paying, one-handed and often on spotty data. They glance at the app in spare moments to decide whether they can afford something.

Other young adults, such as early-career people on a salary or anyone who has lost track of their money, can still use it. Design decisions are made for the student first.

The build is a course/capstone project, so the instructors or evaluators who grade it and watch it demoed are a second audience.

## Product Purpose

Finance; Tracker exists so a student's allowance lasts until the next one arrives. It paces spending against the money actually coming in: the allowance schedule plus any top-ups. It also stamps each payment with where it happened, so the stamp can make logging faster and show where the money goes.

Success after a month of use means allowance day arrives with money left, and the student knows where the rest went. For the course, the demo must hold up on a real Android phone and show GPS/location, maps and notifications working.

## Positioning

Pace is measured against the allowance itself: how much is left until the next allowance, and what that leaves per day. It is not measured against an abstract monthly budget.

The location stamp has four jobs, and each has to earn its place:
1. One-tap logging at places the student has paid before, with the place, category and usual amounts pre-filled.
2. Habits by place: what a place costs this allowance period compared with the last.
3. A nudge at the place where it matters.
4. Remembering what a payment was and where it happened.

All data stays on the phone: no account, no backend, no sync.

## Operating Context

- **Money in:** an allowance on a schedule (weekly on a set weekday, or monthly on a set date) plus occasional top-ups.
- **Logging on the spot:** right after paying at a canteen, convenience store, transport terminal, mall or dorm. The location is captured automatically (GPS or network), can be picked manually on a map, or can be left off.
- **Quick checks:** "Can I afford this?" in spare moments. The answer has to be on the first screen.
- **Offline first:** logging never needs a connection. Payments logged offline keep their coordinates, and their place names are looked up later when the device comes back online or the app resumes.
- **Demos and grading:** graded on GPS/location, maps and notifications. Sample data loads realistic geotagged spending around the user's current location or around Manila, so a grader can see every feature without anyone walking around first.
- **Getting data out:** CSV export (amounts, places, addresses, coordinates, accuracy) through the Android share sheet, or a file download on the web.

## Capabilities and Constraints

- **Screens today:** tabs for Home, History, Map, Places and Settings, plus the transaction form (new and edit), the transaction detail screen and the place sheet.
- **Transaction:** expense or income, amount, category, note, payment method (cash, e-wallet, card, bank), date, and an optional location stamp. The stamp holds coordinates, accuracy, source (gps, network or manual), place name, address, whether the name was typed by the user, and the status of the place-name lookup.
- **Categories:** a fixed set of nine expense categories (Food & Drinks, Transport, Groceries, Shopping, Bills & Load, School, Health, Leisure, Other) and four income categories (Allowance, Salary / Pay, Gift, Other income). Users cannot create custom categories.
- **Location:**
  - an auto-stamp toggle;
  - precise GPS or battery-saving network location;
  - an optional place-name lookup through OpenStreetMap Nominatim, limited to one request per second and cached on the device;
  - payments within a chosen radius (40, 80, 150 or 300 m) are grouped as one place, and renaming a place renames every payment there;
  - name and category suggestions come from past nearby payments and work offline;
  - pending lookups are shown and can be retried.

  The first stamp is explained in the add form before the system permission prompt appears.
- **Budget today:** a monthly budget, where 0 means no budget, with three pace states: on pace, ahead of pace, over budget.
- **Decided, not yet built (confirmed 2026-11-12):**
  - **Allowance:** the monthly budget is replaced by an allowance (amount plus schedule) with top-ups that extend the current period. Existing payments keep working.
  - **Notifications:** local notifications, which need `@capacitor/local-notifications` and Android 13+ notification permission: a morning pace message and an allowance-day recap.
  - **Arrival notifications at habit places:** these need background location ("Allow all the time") and a foreground service, and they tighten Play Store review. Whether they make the demo is decided by 2026-11-19.
  - **Sample data:** re-seeded as allowance periods.
- **Course requirements (captured 2026-11-12):** the demo must show GPS/location, maps and notifications, and be demo-ready by 2026-11-26.
- **Out of scope:** bank sync, accounts, cloud backup or sync, streaks or badges, and charts for their own sake. There are also no recurring transactions and no custom categories.
- **Currencies:** PHP by default, plus USD, EUR, JPY, KRW, SGD and GBP.
- **Data:** everything is stored on the device through Capacitor Preferences. There is undo after deleting one payment, and a confirmation before deleting everything.
- **Device features in use:** Geolocation, Haptics, Filesystem, Share, Preferences, App lifecycle (resume), Keyboard and Status Bar, plus HTTP calls to Nominatim and the map tile server.
- **Stack:** Ionic 9 with Angular 22 standalone components, Capacitor 8, and Leaflet maps. It ships as an Android app through Capacitor; no iOS project exists. On Android, Ionic draws its components in Material (md) mode.
- **Map tiles:** CARTO tiles with an API key (`cartoApiKey` in `src/environments/`), light and dark styles. If the key is empty, the app falls back to OpenStreetMap's standard tiles, which are fine for development and demos but not for a widely distributed app.
- **Required attribution:** "Map data © OpenStreetMap contributors", the tile credit ("Tiles © CARTO"), and Nominatim credited for place names.
- **Terms used in the app:** a location "stamp" / "stamped", "place", "No place", "Unnamed place", "Around you", "Where it went".
- **Still to decide:**
  - whether money in is labeled "Income" or "Money in";
  - when a monthly allowance period starts;
  - Roboto or a brand font;
  - whether to restrict the CARTO key to the app;
  - arrival notifications, by 2026-11-19.

## Brand Commitments

- **Name:** "Finance; Tracker". The semicolon is part of the name everywhere: the Android app label, the page title, the export title, the permission instructions and the wordmark on Home and Settings.
- **Voice in the current copy:** plain, friendly, second person, short sentences, e.g. "Stamp new payments with where you pay", "Stamps stay on this phone." Each data-sharing setting explains what leaves the phone in one line.
- **Not yet existing:** a custom logo or app icon. The launcher icons, splash screen and favicon are still the Capacitor/Ionic defaults.

## Evidence on Hand

- **Sample data:** a seeded generator in `src/app/core/services/demo-data.service.ts`, with each note matched to the category it is filed under. It is synthetic and must stay labeled as sample data.
- **Real-world proof:** none on hand. There are no real users, testimonials, usage numbers, store listing, ratings or press. Future work must not invent any of these.
- **Version:** shown in the app as v1.0.0.

## Product Principles

1. **Capture beats completeness.** Logging happens at the counter, in seconds, one-handed; at a place the student has paid before, it should take one tap. A payment saved without a note is better than one never logged.
2. **The allowance is the clock.** Every screen first answers "how much is left until my next allowance, and what does that leave per day?"
3. **Place earns its keep.** The location stamp has to make logging faster, habits visible, nudges timely or payments memorable. A map for its own sake doesn't count.
4. **The phone keeps it, and offline never blocks.** Data stays on the device, and anything that leaves is opt-in and explained in one plain sentence. No connection, a rough fix or a refused permission degrades the stamp, never the logging.
5. **Always demo-ready, always honest.** Every screen has to look right with sample data in front of a grader. Sample data and approximate locations are labeled for what they are.
