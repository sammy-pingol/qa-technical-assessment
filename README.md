# Sr. Quality Test Engineer — Technical Assessment

Web and API test automation for the two case studies in the brief, built with
**Playwright + TypeScript**.

| Case study | Target |
|-----------|--------|
| Web automation | https://www.cheapflights.com.au |
| API automation | https://restful-booker.herokuapp.com |

---

## Quick start

```bash
npm install
npx playwright install chromium
npm test
```

| Command | What it runs |
|---------|-------------|
| `npm test` | Both suites |
| `npm run test:api` | API suite only — no browser needed, runs in seconds |
| `npm run test:defects` | The executable defect report — **expected to fail**, one per open bug |
| `npm run test:web` | Web suite only, headless Chromium |
| `npm run test:headed` | Web suite with a visible browser |
| `npm run test:mobile` | Header suite against a Pixel 5 profile |
| `npm run test:ui` | Playwright's interactive UI mode |
| `npm run report` | Open the last HTML report |
| `npm run typecheck` | TypeScript, no emit |

No configuration is required — both base URLs have working defaults. Copy
`.env.example` to `.env` only if you need to point the suite elsewhere.

---

## Verified results

Last full run — `npm test`, Chromium, macOS, 3 workers:

```
  73 passed
   4 skipped
   0 failed
  (3.0 minutes)
```

`npm test` runs **77 tests** across three projects: **37 API** tests (no browser,
~8s), **30 web** tests, and **10 of the header tests re-run against a Pixel 5
profile**. The 12 known-defect tests are a fourth project and are deliberately
excluded — run them with `npm run test:defects`, where they are expected to fail.

Skips vary between **4 and 5** depending on which results-page variant the site
serves; the table below says why.

**81 documented cases** — 32 web, 37 API, and 12 executable defect cases. 27 are
negative.

The four skips are deliberate and each names its reason in the report:

| Skipped | Why |
|---------|-----|
| TC-W-004, TC-W-005, TC-W-009 (mobile only) | The account control collapses into the navigation drawer at mobile width, so "Sign in is flush right of the logo" is not meaningful there. TC-W-009 resizes to 375px, which the mobile project is already at. |
| TC-W-041 and/or TC-W-046 | The results page is A/B tested. One variant ships no "N of M flights" counter and no desktop Direct filter; whichever is absent on the run skips with a named reason. Asserting a control the product does not always ship would be a false failure. |

### The two suites, and why one of them is red on purpose

| Suite | Command | Asserts | Expected |
|-------|---------|---------|----------|
| Functional | `npm test` | what the API does **today**, annotated with the defect it deviates on | **Green** — red means something new broke |
| Known defects | `npm run test:defects` | what the API **should** do | **Red** — one failure per open defect |

The defect suite fails deliberately. A red result should mean something is wrong,
and twelve things are wrong; presenting those as passes would misrepresent the
API's state to whoever reads the report. When a defect is fixed, its test goes
green and the entry in `docs/defects.md` closes — nothing to retire, no inverted
signal to explain.

They are separate Playwright projects and `npm test` excludes the defect suite.
That separation is the point: it keeps twelve permanent, known failures from
drowning out a thirteenth, genuinely new one. In CI the defect job runs as
`continue-on-error`, so the bug count is visible on every run without gating the
build.

Verified in both directions: the defect suite reports `12 failed`, and
temporarily asserting the actual `200` in DEFECT-001 makes it `11 failed,
1 passed`.

---

## What is in here

```
docs/
  test-plan.md         scope, design techniques, risks, and the reasoning
                       behind every significant decision
  test-cases-web.md    formal test cases, ID -> steps -> expected result
  test-cases-api.md    formal test cases for the four endpoints + auth
  traceability.md      brief requirement -> test case -> spec file
  defects.md           12 defects found in the API, with reproductions
  site-recon.md        evidence behind the web selector strategy
tests/
  web/
    pages/             page objects (base, home, results)
    fixtures/          page objects delivered as Playwright fixtures
    header.spec.ts         1a — logo + login, displayed AND positioned
    flight-search.spec.ts  1b — searching flights
    search-results.spec.ts 1c — assertions on results
  api/
    clients/           BookingClient — a thin, assertion-free API wrapper
    data/              generated test data, never hard-coded
    support/           shared response-shape assertions + defect annotations
    auth.spec.ts             precondition for update and delete
    create-booking.spec.ts   2a
    update-booking.spec.ts   2b
    get-booking.spec.ts      2c
    delete-booking.spec.ts   2d
```

---

## How the brief's "MUST HAVES" are met

**Positive tests** — happy paths for every endpoint and every web flow.

**Negative tests** — absent, forged and valid auth tokens; missing, mistyped and
out-of-range fields; unknown and malformed ids; repeat deletes; invalid routes;
past dates; empty and identical airport pairs. Roughly half of all cases.

**API response field assertions** — every endpoint response is validated field by
field: presence, JavaScript type, ISO date format, and round-trip equality
against what was submitted. Shared helpers live in
`tests/api/support/assertions.ts`, so a contract change fails in one obvious
place. `TC-A-031` additionally asserts that *no undocumented fields* appear.

**Location / position of web element assertions** — the geometry of the header is
asserted, not just its presence. `boxOf()` in `tests/web/pages/base.page.ts`
measures an element and derives its edges and centre; the specs then assert that
the logo is contained by the header band and sits in the left half, that Sign in
sits in the right half flush to the edge, that the two share a horizontal axis
within tolerance and never overlap, that neither escapes the viewport, and that
the result cards stack downward inside their list.

These are written as **layout invariants, not pixel coordinates**. Hard-coded
values would fail on the first padding change and would prove nothing about
correctness. A relationship such as "the logo must end before Sign in begins"
survives a redesign and still catches the regression that matters.

---

## Two decisions worth explaining

### 1. Selectors are anchored on the accessibility layer

cheapflights.com.au exposes exactly **two** test hooks in the entire page —
`data-test-origin` and `data-test-destination` on the two airport inputs, which
the page object uses directly. Everything else has nothing: no `data-testid`
anywhere, and CSS classes that are build hashes — `mc6t`, `gPDR`, `nrc6`, `e2GB` — that rotate on every deploy. A
suite written against them passes today and is broken tomorrow.

Every locator therefore uses, in order of preference:

0. **An explicit test hook where one exists** — `input[data-test-origin]`
1. **Role + accessible name** — `getByRole('link', { name: 'Go to the cheapflights homepage' })`
2. **A stable id** — `#flight-results-list-wrapper`, `#main-search-form`
3. **A stable id prefix** — `[id^="result-card-description-"]`
4. **The semantic *suffix* of a hashed class** — `[class*="-price-text"]` rather
   than `.e2GB-price-text`. The hash rotates; the human-authored suffix does not.

This has a second benefit: a locator that finds elements the way a screen reader
does fails when the page becomes inaccessible, so the suite doubles as a smoke
test for the accessibility layer. The evidence behind all of this is captured in
`docs/site-recon.md`.

### 2. The API suite asserts actual behaviour and flags the deviations

Twelve behaviours across five endpoints deviate from HTTP convention or from
their own documentation —
`DELETE` answers `201 Created`, a malformed payload answers `500` instead of
`400`, `totalprice: "abc"` is silently stored as `null`.

Asserting the *correct* behaviour would leave a permanently red suite that nobody
trusts. So each spec asserts the **actual** behaviour and attaches a
`flagDefect()` annotation naming the deviation, which surfaces against that test
in the HTML report. The suite stays green and usable as a regression net, the
defects stay visible, and if any of them is fixed upstream the test fails and
forces a conscious review.

All twelve are written up with reproductions and severities in
`docs/defects.md` — **3 High, 6 Medium, 3 Low**. The three High findings share a
single root cause: there is no request validation layer, so input reaches
persistence untyped and unsanitised.

---

## Known constraints

- **Both targets are live third-party systems.** Neither is controlled, so the
  config allows one retry locally and two in CI, capturing a trace on the first
  retry. A trace tells you within seconds whether a failure was a regression or
  third-party noise.
- **The site geolocates its default origin airport** and remembers recent
  searches. Every test runs in a fresh context and explicitly sets both airports
  rather than trusting a default.
- **The search specs drive the real date picker**; the results specs deep-link to
  an already-dated search. That is a runtime and focus decision, not a capability
  one — the nine results tests assert rendering, and re-driving the same form
  before each would cost about a minute and add a failure mode without adding
  coverage. Reasoning in `docs/test-plan.md` §5.
- **In a fresh browser context the date fields are empty**, and the form refuses
  to submit without them. This caught a real flaw in my own first draft: two
  negative tests were passing because the form rejected them for a missing date
  rather than for the condition under test. Both now set valid dates so the
  variable under test is genuinely isolated (`docs/site-recon.md`, finding 9).
- **The API sandbox is world-writable** and periodically reset, so every test
  creates the data it needs and no test depends on a pre-existing record.

---

## CI

`.github/workflows/ci.yml` runs the **API suite** and the **web suite** on every
push and pull request, and both again nightly. The nightly run exists because a
live third-party target can break the suite without anyone touching this
repository. The web job runs with a single worker — this is someone else's
production site, and concurrent searches from one datacenter IP are what a rate
limiter exists to stop. HTML reports upload as artifacts from both jobs.

**A note on one failure worth recording.** The web suite once passed locally and
failed on CI. The tempting conclusion was "third-party flakiness, move it off the
gate", and that change was briefly made. The trace said otherwise: Playwright had
found the autocomplete option, confirmed it visible and stable, and then refused
to click it because the site's sticky header was intercepting the pointer event.
A real robustness bug, reproducible once you knew to look — fixed by keeping the
document scrolled to the top before opening the list, with a keyboard fallback.
The suite went back on the gate. Assuming flakiness is how a real defect gets
filed as noise.
