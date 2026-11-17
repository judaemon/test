# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Cadets of the Philippine Military Academy (PMA), ordering for an academy event.** At the Battalion Hop (Nov 2026), 300 of 303 real orders came from cadets: 163 from 2CL and 137 from 1CL. Each cadet belongs to a company (Alfa through Hawk, in two battalions) and a class, and gives a serial number at checkout. Orders came in during the final days before ordering closed (busiest day Nov 11) and mostly in the evening (7 to 9 pm Philippine time). Most cadets ordered as guests: only 43 orders were tied to an account.

Assume a cadet has never used a shop like this and isn't comfortable with websites. Every step needs to be obvious without reading instructions twice.

**Civilians** (family, partners) are a tiny share and for now order by messaging the shop, not on the site.

**Shop staff and owner** run the event from the admin:
- the owner on a laptop (payments, staff, reports, data export);
- staff on iPads (the order board, payment checks, stock, delivery photos);
- florists on their phones, through a private token link to their own bouquet sheet;
- printing on site during the rush: dedication cards, order slips on a receipt printer, delivery lists, florist checklists.

## Product Purpose

ORAIA is a Baguio City florist built around PMA events. For each event the shop opens online ordering, takes bouquet orders and payments, makes the bouquets, and delivers them to cadets by company on the event days. Between events the site stays up in view-only mode: bouquets to look at, with ways to message the shop, and no ordering.

**Success means zero mix-ups on the day:** every bouquet reaches the right cadet in the right company, with the right card. Ordering, payment checks, florist sheets, cards and delivery lists all serve that.

## Positioning

The shop is built around how the academy is organized. Orders carry company, class and serial number. Deliveries, cards and florist checklists are grouped and colored by company and battalion. Delivery days are set per event, and the shop switches between open, fully booked and view only to follow the academy calendar. A general online florist doesn't know any of this.

## Operating Context

- **Event cycle:** set the event's delivery dates → open ordering → close when full ("fully booked") → make and deliver → view only until the next event. At the Battalion Hop, deliveries fell on Nov 14 (106 orders) and Nov 15 (111), and 84 orders left the date open.
- **Payment:** cash 157, GCash 93, bank transfer 46, Maya 7. Online payments upload a screenshot that staff verify; cadets can also pay cash to a designated cadet collector. Payment states: pending, paid, verified, on hold, rejected.
- **Money:** average order about ₱1,114 (₱95 to ₱5,500); about ₱330k across non-cancelled orders at the Hop.
- **Catalog:** signature bouquets (each with styles, flower recipes and wrappers), a custom bouquet builder with sizes (Petite, Classic, Impressive, Grand), arrangement types (bouquets, corsages, boutonnières), timed sales and promos.
- **Fulfilment paperwork:** dedication cards print four to an A4 sheet on ORAIA stock, folded or flat; florist sheets go by company then class; delivery lists group by delivery date then company; a receipt printer (58 or 80 mm) prints a slip for each new order.
- **Data:** SQLite under `.data/`. The local copy is a snapshot of the live shop as of 2026-11-17, loaded with `bun run data:import`, and it holds real customers' data.

## Capabilities and Constraints

- TanStack Start (Solid) on Bun, SQLite through `bun:sqlite`, Tailwind v4 with Solid-UI components, Better Auth.
- No public staff sign-up: the owner account comes from env vars, and the owner adds staff.
- No email sending yet (no provider), so there are no order emails and no account verification.
- Deployed at oraiashop.com, with a sitemap and Google Search Console set up.
- Terminology: "company", "class" (1CL to 4CL, or Civilian), "battalion" (1/2, 3/4), "signature bouquet", "custom bouquet", "dedication card", "view only", "fully booked".
- Open: renaming "flowers" to cover greenery (see TODO.md).
- Open: putting civilian ordering on the site; for now civilians message the shop.

## Brand Commitments

- **The ORAIA name and wordmark are fixed** (`src/components/site/brand.tsx`, `public/images/brand/`).
- **Voice: plain, warm, friendly and inviting.** Short everyday words, one clear next step at a time, no florist jargon, and nothing that assumes the reader knows how online shops work.
- Company colors (Alfa green, Bravo white, Charlie red, Delta blue, Echo orange, Foxtrot maroon, Golf yellow, Hawk black; `src/lib/cadets.ts`) are an existing convention for telling companies apart. The user did not mark them as a brand commitment.

## Evidence on Hand

- Real order history from the Battalion Hop (303 orders), product photos, and bouquet catalog in `.data/` (private: never publish customer names, emails, serials or payment proofs).
- Brand assets: `public/images/brand/` (logo, rose logo, share image), contact QR codes in `public/images/contact/`.
- No testimonials, press, or review content exists; don't invent any.

## Product Principles

1. **Right bouquet, right cadet, right card.** If a choice trades polish against getting the delivery right, getting it right wins.
2. **Assume a first-time user.** Big obvious steps, plain words, no surprises at checkout. If a cadet might hesitate, the screen has failed.
3. **Organize everything the way the academy does:** by company, class, battalion and event day.
4. **Built for the rush.** Phones in the evening for cadets, iPads and printers on the day for staff. Make it quick to scan and hard to get wrong under pressure.
5. **Follow the event calendar.** Open, fully booked and view only are normal states of the shop, not error states.

## Accessibility & Inclusion

- **Weak mobile signal.** Cadets often order from the academy on slow or patchy mobile data. Pages must stay light and keep working on a poor connection.
- **Usable on a phone.** Every cadet-facing step, and every staff screen used on the day, must work fully on a phone, not only on a laptop or iPad.
- Beyond that, normal good practice (WCAG AA) applies; no other specific needs are known.
