# Google Search setup checklist

Phase 2: get ORAIA listed on Google. These are steps you do in your browser,
not in the code. Replace `oraiashop.com` below with your real domain.

## Before you start

- [x] The latest code (with `/sitemap.xml` and `/robots.txt`) is deployed.
- [x] `SITE_URL=https://oraiashop.com` is set in the production environment,
      with no slash at the end, then the app is restarted.
- [x] `https://oraiashop.com/sitemap.xml` opens and every link starts with
      `https://oraiashop.com` (not `localhost` or `http://`).
- [x] `https://oraiashop.com/robots.txt` opens and its last line is
      `Sitemap: https://oraiashop.com/sitemap.xml`.
- [x] The site opens on `https://` and `http://` redirects to it.

## 1. Add the site to Google Search Console

- [x] Go to <https://search.google.com/search-console> and sign in with the
      Google account that should own the site.
- [x] Click **Add property** and choose **Domain** (not URL prefix). Enter
      `oraiashop.com` (no `https://`, no `www`).
- [x] Google shows a **TXT record** (starts with `google-site-verification=`).
      Copy it.
- [x] At your domain provider (e.g. Cloudflare → DNS → Records), add a record:
      Type `TXT`, Name `@`, Content: the copied value.
- [x] Back in Search Console, click **Verify**. If it fails, wait 10–30 minutes
      and try again; DNS can take a while.

## 2. Submit the sitemap

- [x] In Search Console, open **Indexing → Sitemaps**.
- [x] Enter `sitemap.xml` and click **Submit**.
- [x] Status shows **Success** and "Discovered pages" is about the number of
      bouquets plus 3. (It can take a day to update.)

## 3. Ask Google to index the main pages

- [x] Paste `https://oraiashop.com/` into the search bar at the top of Search
      Console (**URL Inspection**).
- [x] Click **Request indexing**.
- [ ] Do the same for `https://oraiashop.com/shop` and
      `https://oraiashop.com/custom`.
- [x] No need to do this for each bouquet: the sitemap covers them.

## 4. Google Business Profile (recommended)

This is what puts the ORAIA info box beside the results when someone searches
the name.

- [x] Go to <https://business.google.com> and click **Manage now**.
- [x] Business name: **ORAIA**, exactly as on the site.
- [x] Category: e.g. **Florist**.
- [x] Choose a shop address or a service area (if you deliver and have no
      walk-in shop, hide the address and set the areas you deliver to).
- [x] Website: `https://oraiashop.com`. Add your phone number and hours.
- [ ] Complete Google's verification (postcard, phone, or video).
- [ ] Add a logo, a cover photo and a few bouquet photos.

## 5. Bing (optional, 2 minutes)

Bing also powers DuckDuckGo and Yahoo results.

- [ ] Go to <https://www.bing.com/webmasters>, sign in, and choose
      **Import from Google Search Console**.

## 6. Link the site from your other accounts

Every place that names "ORAIA" and links to the site helps Google connect the
name to it.

- [ ] Facebook page: Website field set to `https://oraiashop.com`.
- [ ] Instagram bio link.
- [ ] TikTok bio link (if used).
- [ ] Use the same name everywhere (**ORAIA**), and the same handle where you
      can (e.g. `@oraiashop`).
- [ ] Ask event organizers, school pages or partners that mention you to link
      to the site.

## 7. Check progress

- [ ] **After 3–7 days:** search `site:oraiashop.com` on Google. The pages that
      show up are the ones indexed.
- [ ] **After 1–2 weeks:** Search Console → **Indexing → Pages**. Most pages
      should be "Indexed". Check the reasons for any that aren't.
- [ ] **After 2–4 weeks:** search `oraiashop` and `oraia` and note where the
      site appears.
- [ ] **Monthly:** Search Console → **Performance**. See which searches bring
      people to the site.

## If something goes wrong

- **Sitemap "Couldn't fetch":** open the sitemap URL in a private window; it
  must load without signing in. Check `SITE_URL` is set.
- **Links in the sitemap show `localhost` or `http://`:** `SITE_URL` isn't set
  in production, or the app wasn't restarted after setting it.
- **Page "Excluded by robots.txt":** expected for admin, account, checkout,
  pay, order and sign-in pages. If a public page shows this, tell Claude.
- **"Crawled – currently not indexed":** normal for a new site. It usually
  clears up after a few weeks and some links from other sites.
