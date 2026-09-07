# Web Test Cases — cheapflights.com.au

`(P)` positive · `(N)` negative
All cases assume: Chromium, 1440x900, locale en-AU, a fresh browser context
(the site persists recent searches), and no logged-in user.

## 1a — Logo and login button displayed, and correctly positioned
File: `tests/web/header.spec.ts`

| ID | Type | Title | Steps | Expected result |
|----|------|-------|-------|-----------------|
| TC-W-001 | P | Logo is displayed and links home | 1. Open the home page | Logo is visible, has `href="/"`, and has non-zero width and height |
| TC-W-002 | P | Sign in control is displayed | 1. Open the home page | The Sign in control is visible and enabled |
| TC-W-003 | P | Logo is positioned in the header, top-left | 1. Open home 2. Measure the header and the logo | Logo is vertically contained by the header band, **starts** within the left half of the viewport (and on desktop **ends** within it too), and starts near the top |
| TC-W-004 | P | Sign in is anchored top-right | 1. Open home 2. Measure the header and Sign in | Sign in starts in the right half, sits within 48px of the right edge, and is vertically contained by the header |
| TC-W-005 | P | Logo and Sign in share a horizontal axis | 1. Open home 2. Measure both | Vertical centres differ by no more than 8px, and the logo's right edge is at or before Sign in's left edge (no overlap) |
| TC-W-006 | P | Logo follows the navigation toggle | 1. Open home 2. Measure both | The logo's left edge is at or after the navigation toggle's right edge |
| TC-W-007 | P | Header elements are fully in the viewport | 1. Open home 2. Measure both | Neither element overflows any viewport edge |
| TC-W-008 | P | Header spans the full viewport width | 1. Open home 2. Measure the header | Header starts at x≈0 and spans the full viewport width with a non-zero height |
| TC-W-009 | N | Header survives a 375px viewport | 1. Open home 2. Resize to 375x812 | The logo remains visible and does not overflow either horizontal edge |
| TC-W-010 | N | A non-existent control is reported absent | 1. Open home 2. Locate a fictitious button | Count is 0 — proves the locators are capable of failing |

TC-W-001/003/006/007/008/009 also execute against a Pixel 5 profile via the
`web-mobile` project. TC-W-004 and TC-W-005 are skipped there: the account
control collapses into the navigation drawer on mobile.

## 1b — Searching flights
File: `tests/web/flight-search.spec.ts`

| ID | Type | Title | Steps | Expected result |
|----|------|-------|-------|-----------------|
| TC-W-020 | P | Search form exposes all trip inputs | 1. Open home | Origin, destination, departure date, return date and Search are all visible; Search is enabled |
| TC-W-021, TC-W-022, TC-W-023 | P | A Sydney → Melbourne search reaches results that echo the route | 1. Set origin Sydney 2. Set destination Melbourne 3. Pick departure +30d and return +37d in the calendar 4. Search | **021**: reaches `/flight-search/SYD-MEL/...` — in the tab submitted from *or* a newly opened one — and at least one result renders · **022**: the origin and destination controls carry "Sydney" and "Melbourne" in their accessible names · **023**: document title matches `SYD to MEL` |
| TC-W-024 | P | Swap reverses origin and destination | 1. Set Sydney → Melbourne 2. Click swap | Origin reads Melbourne, destination reads Sydney |
| TC-W-025 | N | Unrecognised destination offers no suggestion | 1. Type "Zzzzqqqx Not An Airport" into destination | Zero autocomplete options are offered |
| TC-W-026 | N | Search with no destination returns no results | 1. Set origin 2. Set **valid dates** 3. Submit | **No open tab** reaches a results URL within 15s, **and** the search form is still displayed |
| TC-W-027 | N | Identical origin and destination returns no results | 1. Set Sydney for both 2. Set **valid dates** 3. Submit | **No open tab** reaches a results URL, **and** the search form is still displayed |
| TC-W-028 | N | Unserved route degrades gracefully | 1. Deep-link a route pair with no service | No unhandled error text is rendered |

> **Why 021/022/023 share one journey.** They assert three properties of a single
> completed search. Run as three tests they drove the same four-field form
> against the live site three times, which tripled the load for no extra coverage
> and was this suite's largest source of flakiness. Soft assertions preserve the
> per-property diagnostics.

> **Why these assertions say "no open tab".** The site A/B tests where a
> completed search lands. Usually it navigates the same tab; in one variant
> (~1 attempt in 10) it opens the results in a NEW tab and hands the original
> tab to a paid affiliate — observed as both `secure.flightcentre.com.au`
> (`utm_source=kayak`) and `au.trip.com`. Checking only the submitted tab
> therefore reported a successful search as a failure, and — more seriously —
> left TC-W-026 and TC-W-027 unable to fail, because a successful search no
> longer changed that tab's URL either. Both now check every open tab, and both
> add a positive assertion (the search form is still displayed) that is capable
> of failing on its own.

> **Why TC-W-026 and TC-W-027 set dates.** In a fresh browser context both date
> fields are empty and the form refuses to submit at all. Without valid dates
> these two tests pass because the date is missing — not because the destination
> is missing or the airports are identical. Setting valid dates isolates the
> variable actually under test.

## 1c — Flight search result assertions
File: `tests/web/search-results.spec.ts`
Precondition: a dated SYD→MEL search, departing +30 days, returning +37 days.

| ID | Type | Title | Steps | Expected result |
|----|------|-------|-------|-----------------|
| TC-W-040 | P | Search returns results | 1. Open the search | At least one result card renders |
| TC-W-041 | P | Results counter is coherent | 1. Read the counter | Matches "N of M flights"; N > 0 and M ≥ N |
| TC-W-042 | P | Every result has a valid price | 1. Read the visible prices | Each parses to a number greater than 0 and less than 100,000 |
| TC-W-043 | P | Every result states route, duration, stops, times | 1. Parse the first 5 cards | Each names SYD and MEL, states a duration like "1h 40m", states its stop count, and shows at least two clock times |
| TC-W-044 | P | Results echo the searched dates | 1. Read the date controls | Both carry a concrete date in their accessible name |
| TC-W-045 | P | Cards stack vertically inside the list | 1. Measure the list and the first two cards | The second card renders below the first; cards stay horizontally contained by the list |
| TC-W-046 | P | Direct filter returns only direct flights | 1. Apply "Direct" 2. Re-read the cards | Every visible card is direct; the shown count does not increase |
| TC-W-047 | N | An invalid route fabricates no results | 1. Deep-link XXX → YYY | No result card renders; no unhandled error text |
| TC-W-048 | N | A past departure date is rejected | 1. Deep-link a search departing 30 days ago | No result card renders; no unhandled error text |

## 1c (continued) — Sorting
File: `tests/web/search-results.spec.ts`, describe block "Flight search results — sorting"

Sorting is driven through the URL parameter rather than the on-page control: that
control renders as tabs in one layout variant and as a combobox in another
(`docs/site-recon.md`, finding 10), while the ordering behaviour under test is
identical either way.

Assertions are on the ORDER, never on specific values — live inventory changes
hourly, so "the third result costs $322" would be worthless within the hour.

| ID | Type | Title | Steps | Expected result |
|----|------|-------|-------|-----------------|
| TC-W-049 | P | Cheapest sort returns ascending prices | 1. Open the search with `sort=price_a` 2. Read the first 8 prices | Each result costs at least as much as the one above it |
| TC-W-050 | P | Quickest sort returns ascending durations | 1. Open the search with `sort=duration_a` 2. Sum both legs per card | Each result takes at least as long as the one above it |
| TC-W-051 | P | Cheapest sort surfaces a fare no higher than the default | 1. Read the top fare under `bestflight_a` 2. Read the top fare under `price_a` | The cheapest sort's top fare is less than or equal to the default sort's |
| TC-W-052 | N | An unrecognised sort value does not break the page | 1. Open the search with `sort=not_a_real_sort` | Results still render; no unhandled error text |
