# Site Reconnaissance — cheapflights.com.au
Captured live on 2026-09-04 at 1440x900. This file records WHY the selectors in
the page objects look the way they do.

## Finding 1 — the site exposes exactly TWO test hooks, and no more
`[data-testid]` yields only `page-top-anchor` and a carousel slide — nothing usable.
But a full sweep of `data-test*` attributes found two real hooks:

    input[data-test-origin]        the flight origin combobox
    input[data-test-destination]   the flight destination combobox

Those two are used directly by the page object: an explicit hook always beats an
inferred one. Every other element on the site has no hook at all, which is what
drives findings 2 and 3.

### Trap: accessible-name matching is a SUBSTRING match
`getByLabel('Destination location')` resolves to TWO elements, because the swap
control is labelled "Swap origin and destination locations" — which contains
"destination location". This surfaced as a strict-mode violation across the whole
flight-search spec on the first full run. The fix is `exact: true` (or the
`data-test-*` hook above). Worth remembering: the same trap applies to getByRole's
`name` option, which is also substring-by-default.

## Finding 2 — CSS classes are build-hashed and WILL rotate
Observed on the header: `mc6t`, `gPDR`, `ZGw-`, `wRhj`, `V_0p`
Observed on results:    `nrc6`, `Fxw9`, `hYzH`, `e_0j`, `ev1_`, `yuAt`, `e2GB`, `f8F1`
These are KAYAK CSS-module hashes. Any suite anchored on them is broken by the
next deploy. AVOID.

## Finding 3 — the accessibility layer IS stable and semantic
This is what the page objects target (Playwright getByRole / getByLabel).

### Header
| Element    | Accessible anchor                                  |
|------------|----------------------------------------------------|
| Logo       | a[aria-label="Go to the cheapflights homepage"] href="/" |
| Sign in    | [aria-label="Sign in"] (DIV, role=button)          |
| Hamburger  | [aria-label="Open main navigation"]                |

### Search form (home) — container #main-search-form
| Element         | Accessible anchor                                        |
|-----------------|----------------------------------------------------------|
| Origin          | input[aria-label="Origin location"]                       |
| Destination     | input[aria-label="Destination location"]                  |
| Swap            | [aria-label="Swap origin and destination locations"]      |
| Departure date  | [aria-label="Departure date"]                             |
| Return date     | [aria-label="Return date"]                                |
| Trip type       | [aria-label="Trip type"]                                  |
| Clear a chip    | [aria-label="Remove value"]                               |
| Submit          | button[aria-label="Search"]                               |

### Results page
| Element        | Accessible / stable anchor                         |
|----------------|----------------------------------------------------|
| List wrapper   | #flight-results-list-wrapper  (REAL, stable id)     |
| Result cards   | [id^="result-card-description-"] (stable id prefix)  |
| Results count  | [class*="-results-count"] -> "3777 of 3798 flights"  |
| Airline logo   | img[alt="Jetstar"] etc.                             |
| Direct filter  | [aria-label="Only show results for Direct"]         |
| Airline filter | [aria-label="Only show results for Qantas Airways"] |
| Echoed origin  | [aria-label="Flight origin input Sydney"]           |
| Echoed dest    | [aria-label="Flight destination input Melbourne"]   |
| Echoed dates   | [aria-label="Departure date Thu 1/10"]              |

NOTE: on the results page the search-form aria-labels ECHO THE SUBMITTED VALUES.
That makes them a first-class assertion target for "the search I asked for is the
search I got".

## Finding 4 — geometry baseline @ 1440x900 (for position assertions)
viewport   1440 x 900
header     x0    y0    w1440 h80
logo       x72   y32   w148  h20   right=220   centreY=42
signIn     x1380 y18   w44   h44   right=1424  centreY=40
hamburger  x12   y18   w44   h44   right=56    centreY=40

Derived invariants the tests assert (all verified true):
  logo fully inside header band     32 >= 0 and 52 <= 80
  logo in left half                 220 < 720
  signIn in right half              1380 > 720
  logo is left of signIn            220 <= 1380
  vertically centre-aligned         |42 - 40| = 2  (assert <= 5 tolerance)
  signIn anchored to right edge     1440 - 1424 = 16 (assert <= 32)
  logo is right of hamburger        72 > 56
  both fully within viewport        right<=1440, bottom<=900

## Finding 5 — the site GEOLOCATES the default origin
From a Philippines IP the origin pre-fills to "Manila (MNL)"; the reviewer running
this in Australia will see a different default. Origin/destination are rendered as
removable CHIPS, not plain input values.
=> Tests must NEVER rely on the default. Always clear, then set both fields.
=> This is also why a raw input.value read returns "" — the value lives in a chip.

## Finding 6 — result card anatomy
"06:30 – 08:10 | SYD Kingsford Smith | - | MEL Melbourne | direct | 1h 40m |
 20:55 – 22:20 | ... | Jetstar | $219 | Economy | Trip.com | View Deal"
Assertable per card: time HH:MM – HH:MM, IATA codes, stops (direct|N stop[s]),
duration \d+h \d+m, price ^\$[\d,]+$, cabin, provider.

## Finding 7 — no bot-wall hit
Direct navigation to /flight-search/SYD-MEL/<dates> rendered ~51 cards and a live
count. A WAF header (x-sn-waf-code) is present but did not trigger. Treated as a
standing risk in the test plan, not a blocker.


## Finding 8 — the date picker IS accessible (correcting an earlier assumption)
My first pass concluded the calendar had no stable hooks. That was wrong: the
first inspection clicked the wrong coordinate and found an empty drawer. A proper
inspection shows a fully accessible, well-built widget:

    table[role="grid"][aria-multiselectable="true"]   one per month, 2 rendered
      tr[role="row"].or3C-week
        td[role="gridcell"][aria-selected][aria-current]
          div[role="button"][aria-label="October 1 2026. Selected as start date. ..."]

    [aria-label="Next month"] / [aria-label="Previous month"]

So a day is addressable as:
    [role="button"][aria-label^="October 1 2026"]
built from `${monthName} ${day} ${year}` with no leading zeros. `pickDay()` in
home.page.ts pages forward with "Next month" (bounded to 6 clicks) when the
target month is not among the two on screen.

## Finding 9 — dates are EMPTY in a fresh browser context
This is the one that mattered most.

Driving the form by hand, the dates appeared pre-filled — the site had restored
them from a previous session. In a clean Playwright context both date fields are
empty, and submitting produces a modal:

    "An error occurred while trying to perform your search
       1. Please enter a valid 'Depart' date.
       2. Please enter a valid 'Return' date."

Consequences, both important:
  1. Every search test MUST set dates explicitly.
  2. The negative search tests were initially passing for the WRONG REASON — the
     form rejected them for a missing date, not for the condition under test.
     TC-W-026 and TC-W-027 now set valid dates so the variable under test is
     genuinely the only invalid thing about the search.

The general lesson: exploring a site in a browser that carries your own history
tells you how the site behaves for a returning user, not for a new one. Always
confirm findings in a clean context.


## Finding 10 — the results page has at least two A/B tested layouts
Repeat runs against the same URL land on different layouts. One renders a
"N of M flights" counter and a desktop filter sidebar; another renders results
and filters but NO counter at all, and exposes a
`#flights-responsive-filters-section` instead.

Consequences:
  - `resultsCount` is located by CONTENT (`getByText(/N of M flights/)`) rather
    than by class, so it is found wherever it renders.
  - TC-W-041 and TC-W-046 skip explicitly, with a reason, on the variant that
    does not offer the element. A skip that names the variant is honest; a
    hard-coded assertion against a control the product does not always ship
    would be a false failure that erodes trust in the suite.


## Finding 11 — submitting the search does not always keep you on cheapflights
A completed search sometimes does NOT navigate the tab it was submitted from.
Instead:

  - the results open in a **NEW tab**, on the normal route
    `cheapflights.com.au/flight-search/SYD-MEL/2026-10-07/2026-10-14/2adults?...`
  - the **original** tab is handed to a paid affiliate. The affiliate VARIES:
      secure.flightcentre.com.au/.../results?utm_source=kayak&utm_medium=aggregators&utm_campaign=compare-to-frontdoor
      au.trip.com/flights/Sydney-to-Melbourne/tickets-SYD-MEL?...

MECHANISM — captured from the site's own call stack by hooking window.open:

    onFormClick  ->  r.start  ->  n.open  ->  window.open(resultsUrl, '_blank')
    (content.r9cdn.net/frontier/assets/<hashed>.js)

So the new tab is deliberate site behaviour, not a redirect or a site change.
The submitted tab is then navigated to the affiliate ~5s later.

FREQUENCY DEPENDS ON HOW THE FORM IS DRIVEN, and that gap is the finding.

  human driving the browser      2 / 2      (Playwright-controlled browser,
                                            clicked by hand)
  script driving the browser     0 / 10     (same browser, same route, dates
                                            and passenger count)
  earlier full-suite runs        3 / 27     (retries disabled)

RULED OUT as the cause of the gap:
  - headless vs headed              identical, 3/3
  - fresh vs persistent profile     identical
  - repeat searches in one session  identical, 3 rounds
  - a slow redirect being missed    no: it lands ~5s later; watched every second
                                    for 60s, six times, and it never moved
  - passenger count and dates       no: a script reproducing the exact URL
                                    (SYD-MEL, same dates, /2adults) did not hand off

NOT IDENTIFIED: the actual trigger. Behavioural signals are suspected — the
human runs involved real cursor movement and ~44s of interaction, the scripted
runs ~12s with none — but this is UNPROVEN and should be stated as such.

An earlier draft of this finding claimed the site withholds handoffs from
traffic it fingerprints as automated. That is FALSE and is recorded here so the
mistake is not repeated: the human-driven reproduction ran inside a
Playwright-controlled browser, which disproves it.

The experiment assignment appears to travel in KAYAK's `mst_*` cookies
(`mst_client`, `mst_iBfK2w`, `mst_ADIrlA` — names stable across sessions, values
sharing repeated group segments). Forcing it was NOT pursued: it would couple
the suite to an undocumented internal experiment id, the same fragility this
document rejects for build-hashed CSS classes.

The manual reproduction is what identified the mechanism. The automated failure
alone looked like "the site moved its results page", which was wrong.

COST NOTE: identifying the above took roughly sixty automated searches against a
live production site, which eventually triggered its bot defence
(/security/check) and temporarily broke the web suite from that IP. Investigating
a third-party system has a traffic budget; this exceeded it.

Consequences:
  - `HomePage.submitAndAwaitResults()` polls EVERY open tab and returns the one
    that reached the results route, rather than watching only the submitted tab.
  - It keys on OUR results route, never on the affiliate's domain. A check for
    `flightcentre.com.au` would have passed today and broken on the Trip.com
    handoff. The property that holds is "some open tab reached our route".
  - TC-W-021/022/023 assert against the returned tab, not the submitted one.
  - TC-W-026 and TC-W-027 were the serious casualty. They proved "no results" by
    the ABSENCE of a results URL on the submitted tab — and once a SUCCESSFUL
    search stopped producing that URL there either, they could no longer fail.
    They now check every tab AND assert positively that the search form is still
    displayed, which is an observable capable of failing on its own.

  - TC-W-029 records which variant each run was served, as an annotation in the
    HTML report, and asserts the handoff only when it occurred. It does not skip:
    every run contributes a data point on how often the variant appears.

The general lesson: retries hid this for days. At the rate automation encounters
it, with two retries in CI a reported failure needs three consecutive misses. It
only surfaced on a run with retries disabled.