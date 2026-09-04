# Test Plan

## 1. Scope

| # | Case study | Coverage |
|---|-----------|----------|
| 1a | Logo and login button displayed | `tests/web/header.spec.ts` |
| 1b | Searching flights | `tests/web/flight-search.spec.ts` |
| 1c | Assertions on flight search results | `tests/web/search-results.spec.ts` |
| 2a | CreateBooking | `tests/api/create-booking.spec.ts` |
| 2b | UpdateBooking | `tests/api/update-booking.spec.ts` |
| 2c | GetBooking | `tests/api/get-booking.spec.ts` |
| 2d | DeleteBooking | `tests/api/delete-booking.spec.ts` |
| — | Auth (precondition for 2b, 2d) | `tests/api/auth.spec.ts` |

**Out of scope.** Payment and booking completion on cheapflights (leaves the
system under test and transacts with third-party providers); load and performance;
cross-browser beyond Chromium and one mobile profile; accessibility audit beyond
the role/name checks the locator strategy already depends on.

## 2. Systems under test

| | Web | API |
|---|-----|-----|
| Target | https://www.cheapflights.com.au | https://restful-booker.herokuapp.com |
| Nature | Live third-party production site, KAYAK infrastructure | Shared public sandbox |
| Controlled? | No | No |
| Notes | WAF present, A/B tested layouts, ad iframes, geolocated defaults | Data is world-writable and reset periodically |

Neither is a controlled environment. That single fact drives most of the design
decisions below.

## 3. Test design techniques

- **Equivalence partitioning** — valid vs. invalid airport pairs; valid,
  mistyped, missing and out-of-range booking fields.
- **Boundary analysis** — dates at and either side of today; zero and negative
  `totalprice`; empty strings.
- **State transition** — create → read → update → read → delete → read, asserting
  the state after each hop rather than trusting the write response alone.
- **Negative and security-adjacent probing** — absent, forged and valid tokens;
  script payloads in free-text fields; malformed ids.
- **Layout invariant testing** — relational geometry assertions rather than
  golden screenshots, for the reasons in §5.

## 4. Entry and exit criteria

**Entry:** Node 18+ installed; Playwright browsers installed; both targets
reachable (`/ping` returns 201 for the API).

**Exit:** every spec executed; all failures triaged into either a product defect
(written up in `docs/defects.md`) or a suite defect (fixed); no unexplained
failure left in the report.

## 5. Key design decisions

**Selectors are anchored on the accessibility layer.**
cheapflights ships no `data-testid` attributes, and its CSS classes are build
hashes — `mc6t`, `gPDR`, `nrc6`, `e2GB` — that rotate on every deploy. A suite
built on them passes today and is broken tomorrow. Every locator therefore uses
role + accessible name, or a stable id, or a stable id prefix. Where none of
those exists the code matches the *semantic suffix* of a hashed class
(`[class*="-price-text"]` rather than `.e2GB-price-text`), which survives a
rehash. Full evidence in `docs/site-recon.md`.

**Position is asserted as invariants, not coordinates.**
The brief asks for location/position assertions. Hard-coded pixel values would
fail on the first padding change and prove nothing. The suite instead asserts
relationships that must hold for the design to be correct: the logo is contained
by the header band, it sits in the left half, Sign in sits in the right half and
is flush to the edge, the two share a horizontal axis within tolerance, they
never overlap, and neither escapes the viewport. Those hold across redesigns and
fail on real regressions.

**The search specs drive the real calendar; the results specs deep-link.**
`flight-search.spec.ts` drives the date picker for real — day cells turn out to
be properly accessible (`div[role="button"][aria-label="October 1 2026. ..."]`),
and `pickDay()` pages forward with "Next month" when the target month is not
among the two on screen.

`search-results.spec.ts` then deep-links to an already-dated search. That is a
speed and focus decision, not a capability one: those nine tests assert how
results are rendered, and re-driving the same four-field form before each of them
would add roughly a minute of runtime and a second failure mode without adding
any coverage the search spec does not already provide.

**Negative search tests must isolate exactly one variable.**
In a fresh context the date fields are empty and the form refuses to submit at
all. The first version of TC-W-026 and TC-W-027 therefore passed for the wrong
reason: the search was rejected for a missing date, not for the missing
destination or the identical airport pair. Both now set valid dates first, so the
condition under test is the only invalid thing about the search. A green test
that passes for the wrong reason is worse than a red one, because it is a
regression net with a hole in it.

**Dates are always relative to today.**
Every date is computed as an offset from the current date. A suite with
hard-coded dates silently rots.

**The API suite asserts actual behaviour and flags deviations.**
Twelve endpoints deviate from HTTP convention or their own docs. Asserting the
*correct* behaviour would leave a permanently red suite that nobody trusts.
Asserting the *actual* behaviour with an attached `flagDefect()` annotation keeps
the suite usable as a regression net, surfaces the defects in the HTML report,
and means an upstream fix fails the test and forces a conscious review.

**Test data is generated, never shared.**
`booking.factory.ts` produces uniquely named records so parallel workers cannot
collide, and no test depends on data left behind by another. The API sandbox is
world-writable; nothing in this suite assumes a record it did not create.

## 6. Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| WAF or bot detection blocks the run | Medium | Real browser profile via Playwright's Desktop Chrome device; retries with trace capture; no request flooding. Never hit during development. |
| Site A/B tests a different layout | Medium | Role/name locators; `.or()` fallbacks; layout invariants rather than pixel values; `test.skip` on genuinely absent variants rather than a false failure. |
| Third-party sandbox is down or slow | Medium | Retries in CI; 90s test timeout; `/ping` is an entry criterion. |
| Public API data mutated by other users | High | Every test creates its own record; no reliance on pre-existing ids. |
| Ad iframes shift layout mid-assertion | Low | Position assertions are relational, and Playwright's auto-waiting re-evaluates until stable. |

## 7. Reporting

`npm test` produces a list reporter in the terminal, an HTML report
(`playwright-report/`) with traces, screenshots and video for failures, and JUnit
XML (`reports/junit/`) for CI ingestion. Defect annotations appear against the
individual tests in the HTML report.
