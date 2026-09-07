# API Test Cases — restful-booker

`(P)` positive · `(N)` negative
Base URL `https://restful-booker.herokuapp.com`.
Every case creates the data it needs; none depends on a pre-existing record.
Cases annotated **DEFECT-nnn** assert the service's actual behaviour and flag the
deviation — see `docs/defects.md`.

## Auth — POST /auth
File: `tests/api/auth.spec.ts`

| ID | Type | Title | Steps | Expected result |
|----|------|-------|-------|-----------------|
| TC-A-001 | P | Valid credentials return a token | POST admin/password123 | 200, `content-type: application/json`, non-empty `token` string |
| TC-A-002 | N | Invalid credentials return no token | POST a wrong password | No `token` field; `reason` is "Bad credentials" — **DEFECT-009** (status is 200, not 401) |
| TC-A-003 | N | Empty credentials return no token | POST empty username and password | No `token` field |

## 2a — CreateBooking, POST /booking
File: `tests/api/create-booking.spec.ts`

| ID | Type | Title | Steps | Expected result |
|----|------|-------|-------|-----------------|
| TC-A-010 | P | Valid booking is created and echoed | POST a complete booking | Response OK and JSON; `bookingid` is a positive number; every booking field validates by type and format and round-trips unchanged — **DEFECT-001** (200, not 201; no Location) |
| TC-A-011 | P | additionalneeds is optional | POST without `additionalneeds` | Accepted; the booking still round-trips |
| TC-A-012 | P | Created booking is retrievable | POST, then GET the new id | 200; the persisted record matches the payload field for field |
| TC-A-013 | P | depositpaid false is not coerced | POST with `depositpaid: false` | Persisted as `false` |
| TC-A-014 | N | Missing required fields rejected | POST `{firstname}` only | Not OK — **DEFECT-004** (500, not 400; text/plain; no field detail) |
| TC-A-015 | N | Empty payload rejected | POST `{}` | Not OK |
| TC-A-016 | N | Mistyped fields not silently corrupted | POST `totalprice:"not-a-number"`, `depositpaid:"maybe"` | **DEFECT-005** — 200 returned, `totalprice` stored as `null`, `depositpaid` coerced to `true` |
| TC-A-017 | N | Negative price rejected | POST `totalprice: -500` | **DEFECT-006** — accepted and stored |
| TC-A-018 | N | Inverted date range rejected | POST checkout before checkin | **DEFECT-007** — accepted and stored |
| TC-A-019 | N | Script payload not stored unescaped | POST `<script>alert(1)</script>` as firstname | **DEFECT-008** — stored and reflected verbatim |

## 2b — UpdateBooking, PUT / PATCH /booking/{id}
File: `tests/api/update-booking.spec.ts`

| ID | Type | Title | Steps | Expected result |
|----|------|-------|-------|-----------------|
| TC-A-020 | P | Authenticated PUT replaces every field | Seed, then PUT a full replacement with a token | 200, JSON; every field validates and matches the replacement |
| TC-A-021 | P | Update is persisted, not just echoed | PUT, then GET | The fresh read reflects the update |
| TC-A-022 | P | PATCH updates only the supplied field | Seed, then PATCH `firstname` | 200; `firstname` changes; lastname, totalprice and bookingdates are unchanged |
| TC-A-023 | N | Update without a token is refused | PUT with no token | Not OK, and a fresh read proves the record is unchanged — **DEFECT-010** (403, not 401) |
| TC-A-024 | N | Update with a forged token is refused | PUT with a junk token | 403 |
| TC-A-025 | N | PUT with a partial body is refused | PUT `{firstname}` only, with a token | 400 (correct behaviour) |
| TC-A-026 | N | Update of an unknown id creates nothing | PUT id 999999999 | Not OK — **DEFECT-012** (405, not 404) |

## 2c — GetBooking, GET /booking and /booking/{id}
File: `tests/api/get-booking.spec.ts`

| ID | Type | Title | Steps | Expected result |
|----|------|-------|-------|-----------------|
| TC-A-030 | P | Existing booking returned in full | Seed, then GET the id | 200, JSON; every documented field present, correctly typed, ISO-formatted dates, values match the payload |
| TC-A-031 | P | Only documented fields returned | GET a seeded booking | No undocumented keys; `bookingid` is not echoed inside the booking object |
| TC-A-032 | P | Index returns booking ids | GET /booking | 200; a non-empty array whose entries carry a numeric `bookingid` |
| TC-A-033 | P | Index filters by name | GET /booking?firstname=&lastname= | 200; the seeded booking is findable and the fetched record matches |
| TC-A-034 | N | Unknown id returns 404 | GET id 999999999 | 404 — **DEFECT-011** (body is text/plain despite `Accept: application/json`) |
| TC-A-035 | N | Malformed id returns 404 | GET `/booking/not-a-valid-id` | 404, not a server error |
| TC-A-036 | N | Deleted booking is not retrievable | Seed, delete, then GET | 404 |

## 2d — DeleteBooking, DELETE /booking/{id}
File: `tests/api/delete-booking.spec.ts`

| ID | Type | Title | Steps | Expected result |
|----|------|-------|-------|-----------------|
| TC-A-040 | P | Authenticated delete succeeds | Seed, then DELETE with a token | Response OK — **DEFECT-002** (201 "Created" for a deletion) |
| TC-A-041 | P | Deleted booking stays gone | Delete, then GET | 404 |
| TC-A-042 | P | Delete does not affect other bookings | Seed two, delete one, GET the other | The survivor still returns 200 |
| TC-A-043 | N | Delete without a token is refused | DELETE with no token | 403, and the booking still reads 200 |
| TC-A-044 | N | Delete with a forged token is refused | DELETE with a junk token | 403, and the booking still reads 200 |
| TC-A-045 | N | Repeat delete is not a fresh success | Delete twice | Second call is not OK — **DEFECT-003** (405, breaking DELETE idempotency) |
| TC-A-046 | N | Delete of an unknown id is refused | DELETE id 999999999 | Not OK |

## Performance — response-time budgets
File: `tests/api/performance.spec.ts`

Budgets are deliberately generous (6s write, 4s read). restful-booker is a free
public sandbox on shared infrastructure; a tight budget would fail on someone
else's traffic and be muted within a week, which is how performance assertions
usually die. The goal is to catch a STEP CHANGE — an endpoint that went from ~1s
to ~8s — not to police latency. Against a service we owned, these would be tied
to an agreed SLO and assert a percentile across many calls rather than one sample.

| ID | Type | Title | Steps | Expected result |
|----|------|-------|-------|-----------------|
| TC-A-050 | P | Auth responds within budget | POST /auth, timed | 200, and under the 6s write budget |
| TC-A-051 | P | Create responds within budget | POST /booking, timed | Succeeds, and under the 6s write budget |
| TC-A-052 | P | Read responds within budget, and faster than the write | Seed a booking timed, then GET it timed | 200, under the 4s read budget, and not slower than the write that created it |

## Known defects — asserting the behaviour the API should have
File: `tests/api/known-defects.spec.ts`

Twelve cases, one per defect, each asserting the CORRECT behaviour. **They fail
today, and that is the point** — a red result means something is wrong, and
twelve things are. Run them with `npm run test:defects`.

They are a separate Playwright project and are NOT part of `npm test`, so the
functional suites stay green and a genuinely new regression cannot hide among
twelve permanent failures. When a defect is fixed its test goes green and the
entry in `docs/defects.md` can be closed.

| ID | Asserts the API should… | Actual |
|----|-------------------------|--------|
| DEFECT-001 | return `201 Created` from POST /booking | 200 |
| DEFECT-002 | return `200`/`204` from DELETE | 201 "Created" |
| DEFECT-003 | return `404` on a repeat DELETE (idempotency) | 405 |
| DEFECT-004 | return `400` for a payload missing required fields | 500 |
| DEFECT-005 | reject wrongly typed fields | 200, `totalprice` nulled |
| DEFECT-006 | reject a negative `totalprice` | 200, stored |
| DEFECT-007 | reject a checkout before the checkin | 200, stored |
| DEFECT-008 | not store and reflect script content verbatim | stored verbatim |
| DEFECT-009 | return `401` for bad credentials | 200 |
| DEFECT-010 | return `401` when no credentials are supplied | 403 |
| DEFECT-011 | honour `Accept: application/json` on error bodies | text/plain |
| DEFECT-012 | return `404` for a write to an unknown id | 405 |
