---
name: ORAIA
description: A Baguio florist's card in cream and deep rose, for ordering bouquets for academy events.
colors:
  cream: "#fbf7f0"
  petal-50: "#fdf4f6"
  petal-100: "#fbe6ec"
  petal-200: "#f6cdd8"
  petal-300: "#f2a6b8"
  petal-500: "#d9718c"
  petal-700: "#9e3d58"
  petal-900: "#5c1f31"
  sage-100: "#e8eee2"
  sage-300: "#b9c4ad"
  sage-600: "#5f6f51"
  butter: "#f7e3a3"
  white: "#ffffff"
  sale: "oklch(0.56 0.2 25)"
  success: "oklch(0.962 0.044 156.743)"
  success-ink: "oklch(0.448 0.119 151.328)"
  warning: "oklch(0.987 0.026 102.212)"
  warning-ink: "oklch(0.554 0.135 66.442)"
  error: "oklch(0.971 0.013 17.38)"
  error-ink: "oklch(0.505 0.213 27.518)"
typography:
  display:
    fontFamily: "Fraunces Variable, ui-serif, Georgia, serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
    fontVariation: "'SOFT' 100, 'WONK' 1"
  headline:
    fontFamily: "Fraunces Variable, ui-serif, Georgia, serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
    fontVariation: "'SOFT' 100, 'WONK' 1"
  title:
    fontFamily: "Fraunces Variable, ui-serif, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.375
    fontVariation: "'SOFT' 100, 'WONK' 1"
  wordmark:
    fontFamily: "Fraunces Variable, ui-serif, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 500
    letterSpacing: "0.32em"
    fontVariation: "'SOFT' 100, 'WONK' 1"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    letterSpacing: "0.05em"
rounded:
  md: "8px"
  xl: "12px"
  2xl: "16px"
  3xl: "24px"
  full: "9999px"
spacing:
  gutter-phone: "16px"
  gutter-tablet: "24px"
  gutter-desktop: "32px"
  container: "72rem"
  reading: "48rem"
components:
  button-primary:
    backgroundColor: "{colors.petal-700}"
    textColor: "{colors.white}"
    rounded: "{rounded.full}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.petal-900}"
  button-primary-checkout:
    backgroundColor: "{colors.petal-700}"
    textColor: "{colors.white}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.petal-900}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.petal-50}"
  button-ghost:
    textColor: "{colors.petal-900}"
    rounded: "{rounded.full}"
    padding: "0 10px"
    height: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.petal-100}"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.petal-900}"
    rounded: "{rounded.xl}"
    padding: "0 12px"
    height: "44px"
  chip-selected:
    backgroundColor: "{colors.petal-700}"
    textColor: "{colors.white}"
    rounded: "{rounded.full}"
  chip:
    backgroundColor: "{colors.white}"
    textColor: "{colors.petal-900}"
    rounded: "{rounded.full}"
  product-photo:
    backgroundColor: "{colors.petal-50}"
    rounded: "{rounded.3xl}"
  admin-card:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.2xl}"
  nav-link:
    textColor: "{colors.petal-900}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
---

# Design System: ORAIA

## Overview

**Creative North Star: "The Pressed Petal Card"**

ORAIA looks like the card that comes with a bouquet: cream stock, deep rose ink, a soft hand-drawn serif for the names, and plenty of room around each line. The flowers in the photos supply the color; the interface stays in one rose family so the bouquets stay the brightest thing on the screen. Petals and small sparkles drift around the open spaces of the shop pages like loose petals fallen on a card, and never where someone has to read or tap.

The shop is soft and roomy. Steps come one at a time in big pill buttons and plain sentences, because the cadet ordering has likely never used a shop like this. Headings use Fraunces with its soft, slightly wonky cut, and everything people must read and act on (prices, forms, order details) uses the phone's own sans-serif, so it stays fast and familiar on a weak signal.

The admin is its own, quieter world. It keeps the cream page and rose ink so it still feels like ORAIA, but drops all ornament, sets work on white panels, uses Fraunces only for page titles and big numbers, and gives the company colors the job of telling orders apart. It is a tool for a rush on iPads and phones, not a showcase.

**Key Characteristics:**
- Cream page, never pure white; white is for cards, panels and fields.
- One ink: deep rose (petal-900), lightened with opacity for quieter text.
- One action color: rose (petal-700) on fully rounded pills.
- Fraunces with the soft, wonky cut for names and headings; the system sans-serif for everything else.
- Soft rose-tinted shadows under bouquet photos only.
- Decoration (petals, sparkles, a soft pink glow) on shop pages only, away from content.

## Colors

A single warm rose family on cream paper, with sage and butter as small supporting notes; the bouquet photos carry all the real color.

### Primary
- **Deep Rose Ink** (petal-900): the ink for all text, icons and headings across shop and admin. Quieter text is the same rose at lower opacity (about 80% for nav, 65% for descriptions, 55% for hints), never a gray. Also the hover state of the main button and the tint of dark overlays behind dialogs.
- **Garden Rose** (petal-700): the action color. Main buttons, the selected filter chip, the bag count, prices on product cards, and the border of a chosen option.
- **Blush Rose** (petal-500): focus rings and focused field borders, and decorative petals.

### Secondary
- **Pale Petal tints** (petal-50, petal-100, petal-200, petal-300): petal-50 is the hover fill for white buttons and the background behind bouquet photos; petal-100 is the hover fill for nav links and the hairline under the header and between admin panels; petal-200 is the border for fields, chips and secondary buttons; petal-300 is a border on hover.

### Tertiary
- **Sage** (sage-600, with sage-100 and sage-300): the "on" color of toggles and a few calm confirmations. Rare by design.
- **Butter** (butter): the sparkle ornament on the home page. Decoration only.

### Neutral
- **Card Cream** (cream): the page background everywhere, shop and admin, including the translucent sticky header.
- **White** (white): cards, admin panels, the side menu, fields and secondary buttons.

### Status
- **Sale Red** (sale): sale prices and sale tags only.
- **Success, Warning, Error** (success/success-ink, warning/warning-ink, error/error-ink): pale fill with a matching darker ink, for payment states, notices and the danger button's text and hover.
- **Company colors** (from `src/lib/cadets.ts`): Alfa green, Bravo white, Charlie red, Delta blue, Echo orange, Foxtrot maroon, Golf yellow, Hawk black, and gray for civilians. They mark which company an order belongs to on order lists, delivery lists, florist sheets and cards. They are a meaning system, not decoration: always shown with the company's name beside them, never used as brand or accent colors.

### Named Rules
**The One Ink Rule.** All text is Deep Rose Ink at some opacity. No black, no zinc gray: the neutral grays left in the base theme belong to the stock components, not to ORAIA.

**The Photos Bring the Color Rule.** The interface stays rose-on-cream so the bouquets are the most colorful thing on any screen. New colors enter only as status or company meaning.

## Typography

**Display Font:** Fraunces Variable (with ui-serif, Georgia)
**Body Font:** the system sans-serif (-apple-system, Segoe UI, Roboto, Helvetica Neue)

**Character:** Fraunces with its soft, wonky settings turned all the way on gives headings a rounded, handmade warmth, like lettering on a florist's card. The system sans keeps reading and form-filling fast, familiar and free to download.

### Hierarchy
- **Display** (600, 2.25rem on phones up to 3rem, tight leading, slight negative tracking): the main heading on shop pages and the home hero.
- **Headline** (600, 1.875rem): page titles, including every admin page title.
- **Title** (600, 1.125–1.25rem): bouquet names on product cards and section headings in the shop.
- **Wordmark** (500, uppercase, 0.32em tracking): the ORAIA name only. Set it through the `Wordmark` component, which also corrects the trailing letter spacing.
- **Body** (400, 0.875rem in most UI, 1rem on phones for fields so iOS doesn't zoom): descriptions, forms, tables, prices.
- **Label** (500, 0.6875rem, uppercase, 0.05em tracking, reduced opacity): column names on phone-stacked tables, small eyebrows such as "Flower shop · Baguio City".

The admin's smaller section headings are the body sans at semibold, not Fraunces.

### Named Rules
**The Serif Names, Sans Does Rule.** Fraunces names things (bouquets, pages, sections, the brand). Anything a person reads to decide or acts on (prices, buttons, fields, order details, instructions) is the system sans.

**The Soft Cut Rule.** Fraunces always carries the soft, wonky settings (`.type-soft`). A plain Fraunces heading is a mistake. Printed cards are the exception, where the plainer cut prints cleaner.

## Layout

Content sits in a centered column up to 72rem wide (`max-w-6xl`) with side gutters of 16px on phones, 24px on tablets and 32px on desktops. Reading and form pages (checkout, order status, account) narrow to about 48rem.

On phones, the bouquet grid shows three across with photos filling the width and the name and price under each. Wide admin tables turn into stacked cards below 48rem (`.stack-table`): each cell takes half a row, with its column name as a small uppercase label above it.

The admin is a two-column shell on large screens: a 240px white sidebar and the working area on cream. On phones and upright iPads the sidebar becomes a drawer that slides in from the left over a rose-tinted overlay. Admin controls are 44px tall on touch screens and drop to 40px from the `sm` breakpoint.

Everything must work on a phone, and pages must stay light enough for a weak mobile signal.

## Elevation & Depth

Mostly flat, built from tone: cream page, white panels, hairline rose borders. Shadows are rare and tinted rose rather than gray.

### Shadow Vocabulary
- **Bouquet lift** (`box-shadow: 0 18px 40px -24px rgb(92 31 49 / 0.4)`): under bouquet photos on product cards and galleries, so the flowers seem to sit slightly above the card. Some grids deepen it on hover.
- **Dialog** (`shadow-2xl`): dialogs and sheets that float over a rose-tinted overlay (`petal-900` at 40–50%, sometimes with a light blur).
- **Drawer edge** (`box-shadow: 8px 0 32px -12px rgb(0 0 0 / 0.25)`): the admin drawer on phones.

### Named Rules
**The Flowers Float Rule.** Only bouquet photos and things floating over the page (dialogs, sheets, the drawer) cast shadows. Cards, panels and buttons stay flat and use borders.

## Shapes

Soft and round, like petals. Every button, chip, nav link and badge is a full pill; filter triggers and fields are the exception. Fields and option tiles use gently rounded corners (12px); admin panels and cards use 16px; bouquet photos and large shop panels use generous 24px corners. Square corners appear only on printed sheets and receipts.

The petal (a teardrop with a pale center vein), the four-point sparkle and the ORAIA flower mark are the recurring decorative shapes.

## Components

### Buttons
Round, warm and obvious: one clear next step at a time.
- **Shape:** full pill.
- **Primary:** Garden Rose fill with white text, 44px tall (40px from `sm` in the admin), 20px side padding. The main step on checkout and the product page grows to 48px tall, full width and 1rem semibold.
- **Hover / Focus:** fill deepens to Deep Rose Ink; focus shows a 2px Blush Rose ring with a 2px offset. Disabled is 50% opacity.
- **Secondary:** white with a petal-200 border and rose ink; hover fills petal-50.
- **Danger:** white with a soft error-ink border and error-ink text; hover fills with the pale error tint.
- **Ghost:** no fill, rose ink at 70%; hover fills petal-100.

### Chips
- **Style:** pills. Unselected: white with a petal-200 border. Selected: Garden Rose fill with white text (arrangement tabs such as Bouquets / Corsages / Boutonnières).
- **Filter triggers:** not pills: 12px corners, white, a dashed border and a small plus icon, marking an optional filter you can add (Flower, Size).

### Cards / Containers
- **Product card:** no box. A square photo with 24px corners on a petal-50 background with the Bouquet lift shadow; under it, the name in Fraunces, color dots, and the price in Garden Rose. The photo zooms very slightly on hover.
- **Admin panel:** white, 16px corners, a petal-100 hairline border, no shadow.
- **Option tiles** (size, color, wrapper choices): white, 12–16px corners, petal-200 border; checked tiles take a Garden Rose border with an inset 1px ring of the same color.

### Inputs / Fields
- **Style:** white, 12px corners, petal-200 border, rose ink text, placeholder at 35% ink. 44px tall and 1rem text on phones; 40px and 0.875rem from `sm`.
- **Focus:** border turns Blush Rose with a soft 2px Blush Rose ring at 30%.
- **Labels and hints:** the label sits above in medium weight; the hint sits below in 0.75rem at 55% ink and is linked to the field for screen readers.

### Navigation
- **Shop header:** sticky, translucent cream with a blur and a petal-100 bottom hairline, 64px tall. Flower mark and wordmark on the left (the wordmark hides below 440px); pill text links on the right that fill petal-100 on hover; round 40px icon buttons for the account and bag, with a Garden Rose count bubble on the bag.
- **Admin:** a white 240px sidebar. The brand sits in a 64px band whose bottom hairline meets the top bar's. Below it, rounded rows (12px corners) in labelled groups (Orders, Catalog, People, Shop setup, Records), each group named in the small uppercase label style, with the active row filled petal-100. At the bottom, outside the scrolling list, View shop and the sidebar button sit side by side. The sidebar button shrinks the sidebar to a 72px strip of icons (flower mark only, short petal-200 lines between groups, each name in a dark rose tooltip on hover) and expands it again, remembered per device. The sticky white top bar (64px on desktop, 56px on smaller screens) starts with the breadcrumb: a home icon, small chevrons, earlier steps at 60% ink and the current page in full ink. The signed-in person sits on the right: their initials in a petal-100 circle, then their name from `sm`. It opens a white menu with 16px corners and a soft rose shadow holding their name, role badge and email, then Profile and Security, and Sign out set apart below a divider. On phones and iPad upright the top bar starts with a menu button that opens the sidebar as a slide-in drawer carrying the brand.
- **Account area (`/admin/account`):** the sidebar swaps to "Back to dashboard" and an Account settings group (Profile, Security). Pages sit in a centered 48rem column: a Fraunces page title, then sections with a semibold sans heading and a one-line description, each over a white card of rows. A row puts the setting's name and description on the left and its value or field on the right (stacked on phones), with hairline petal-100 dividers; form actions sit in a pale petal-50 footer strip, right-aligned (`SettingsSection`, `SettingsRow`).

### Signature: Company marker
A small round color dot (`ColorSwatch`, 10–14px, with a faint dark outline so Bravo's white still shows) beside the company name, as "● Alfa · 1CL", on order rows, delivery lists, florist sheets and dedication cards.

## Do's and Don'ts

### Do:
- **Do** put pages on Card Cream (`#fbf7f0`); keep white for cards, panels and fields.
- **Do** write all text in Deep Rose Ink, using opacity for quieter levels.
- **Do** make every button, chip and nav link a full pill, with Garden Rose for the one main action.
- **Do** set names and headings in Fraunces with the soft cut, and everything people act on in the system sans.
- **Do** keep the admin quiet: no petals or sparkles, white panels, Fraunces only for page titles and big numbers.
- **Do** show company colors with the company name, as an outlined dot.
- **Do** keep touch targets 44px tall on phones and fields at 1rem so iOS doesn't zoom.

### Don't:
- **Don't** use a pure white page background.
- **Don't** use military styling: no camouflage, stencil lettering, insignia, rank chevrons or badges, even though the customers are cadets.
- **Don't** let petals, sparkles or the pink glow sit on top of prices, buttons, fields or order details; ornament stays in empty space and is hidden from screen readers.
- **Don't** use the stock component grays or black for text; that is the base theme showing through.
- **Don't** add shadows to flat cards, panels or buttons.
- **Don't** use company colors as decoration or as brand accents.
