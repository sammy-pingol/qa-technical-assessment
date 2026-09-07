# Defect Report — restful-booker Booking API

Twelve defects found while building the API suite. Every one was reproduced
directly against `https://restful-booker.herokuapp.com` with `curl` before it was
written up, and every one is referenced from the automated test that covers it
(the id also appears as an annotation in the Playwright HTML report).

**Every defect below is executable.** Two suites cover them from opposite sides:

| Suite | Asserts | Purpose |
|-------|---------|---------|
| The functional specs | what the API does **today**, with a `flagDefect()` annotation naming the deviation | A regression net — a silent behaviour change fails a test |
| `tests/api/known-defects.spec.ts` | what the API **should** do, each marked `test.fail()` | Documents the correct contract, and goes red the day a defect is fixed |

Why both. Asserting only the correct behaviour would leave twelve permanently
red tests, and a suite that is always red gets ignored — at which point it
catches nothing. Asserting only the actual behaviour writes the bug into the
test, so a stranger reading `toBe(200)` sees a test that endorses it.

`test.fail()` resolves this. Playwright treats a test marked expected-to-fail as
passing while it fails, and reports it as a **failure if it ever passes**. So the
build stays green today, the assertions state the correct contract, and the
moment any of these is fixed upstream the build goes red and forces someone to
retire the workaround.

This was verified rather than assumed: temporarily changing DEFECT-001 to assert
the actual `200` made the run report `1 failed`.

Severity uses: **High** — data loss, corruption or a security exposure.
**Medium** — a contract violation a client must work around. **Low** — cosmetic
or convention-only.

---

## DEFECT-001 — POST /booking returns 200 instead of 201 Created
**Severity:** Low · **Endpoint:** `POST /booking` · **Test:** TC-A-010

A successful creation returns `200 OK`. RFC 9110 §9.3.3 specifies `201 Created`
for a request that creates a resource, accompanied by a `Location` header. No
`Location` header is returned either, so a client cannot discover the canonical
URL of what it just created without parsing the body.

```
$ curl -i -X POST .../booking -H 'Content-Type: application/json' -d '{...valid...}'
HTTP/1.1 200 OK          <- expected: 201 Created
                          <- expected: Location: /booking/642
```

**Expected:** `201 Created` with `Location: /booking/{id}`.
**Actual:** `200 OK`, no `Location`.

---

## DEFECT-002 — DELETE returns "201 Created" for a deletion
**Severity:** Medium · **Endpoint:** `DELETE /booking/{id}` · **Test:** TC-A-040

A successful delete responds `201 Created` with the literal reason phrase
`Created` and a `text/plain` body. This is actively misleading: a client
following status-code semantics would conclude a resource had been created.

```
$ curl -i -X DELETE .../booking/643 -H 'Cookie: token=...'
HTTP/1.1 201 Created     <- expected: 200 OK or 204 No Content
Content-Type: text/plain; charset=utf-8
Created
```

**Expected:** `200 OK` or `204 No Content`.
**Actual:** `201 Created`.

---

## DEFECT-003 — Repeat DELETE returns 405, breaking idempotency
**Severity:** Medium · **Endpoint:** `DELETE /booking/{id}` · **Test:** TC-A-045

Deleting an already-deleted booking returns `405 Method Not Allowed`. `DELETE` is
required to be idempotent (RFC 9110 §9.2.2), and `405` asserts the method is not
supported on this resource at all — which is false, since the same method
succeeded moments earlier. Any client with retry-on-timeout logic will
misinterpret a successful-but-retried delete as a fatal error.

**Expected:** `404 Not Found` (or a repeat `204`).
**Actual:** `405 Method Not Allowed`.

---

## DEFECT-004 — Missing required fields cause a 500
**Severity:** High · **Endpoint:** `POST /booking` · **Test:** TC-A-014

A payload missing required fields returns `500 Internal Server Error` with a
`text/plain` body. A malformed client request is a `400`, never a `500` — a `500`
tells the caller the *server* failed and invites a retry that will never succeed.
It also suggests the input reaches business logic without validation. No
field-level detail is returned, so the client cannot tell the user what to fix.

```
$ curl -i -X POST .../booking -H 'Accept: application/json' -d '{"firstname":"OnlyFirst"}'
HTTP/1.1 500 Internal Server Error    <- expected: 400 Bad Request
Content-Type: text/plain; charset=utf-8
Internal Server Error
```

**Expected:** `400 Bad Request`, JSON body naming the missing fields.
**Actual:** `500 Internal Server Error`, plain text, no detail.

---

## DEFECT-005 — Wrongly typed fields are silently corrupted
**Severity:** High · **Endpoint:** `POST /booking` · **Test:** TC-A-016

There is no type validation. `totalprice: "not-a-number"` is accepted with
`200 OK` and silently stored as `null`. `depositpaid: "maybe"` is coerced to
`true`. The caller receives a success response for a booking that no longer means
what they submitted, and a null price will fail downstream in billing rather than
at the boundary where it could be reported.

```
$ curl -X POST .../booking -d '{"firstname":"Sam","lastname":"T","totalprice":"not-a-number",
                                "depositpaid":"maybe","bookingdates":{...}}'
HTTP/1.1 200 OK
{"bookingid":1127,"booking":{...,"totalprice":null,"depositpaid":true,...}}
                                   ^^^^ silently nulled   ^^^^ silently coerced
```

**Expected:** `400 Bad Request` naming the mistyped fields.
**Actual:** `200 OK` with corrupted data.

---

## DEFECT-006 — Negative total price accepted
**Severity:** Medium · **Endpoint:** `POST /booking` · **Test:** TC-A-017

`totalprice: -500` is accepted and persisted. There is no lower-bound validation
on a monetary field. Depending on downstream handling this is a credit rather
than a charge.

**Expected:** `400 Bad Request`.
**Actual:** `200 OK`, `totalprice: -500` stored.

---

## DEFECT-007 — Checkout date before checkin accepted
**Severity:** Medium · **Endpoint:** `POST /booking` · **Test:** TC-A-018

A booking with `checkin: 2026-12-31` and `checkout: 2026-01-01` is accepted. No
chronological validation is applied, so a stay of negative length can be created.

**Expected:** `400 Bad Request`.
**Actual:** `200 OK`, inverted date range stored.

---

## DEFECT-008 — Script payloads stored and reflected unsanitised
**Severity:** High · **Endpoint:** `POST /booking` · **Test:** TC-A-019

`firstname: "<script>alert(1)</script>"` is stored verbatim and reflected in
every subsequent `GET`. The API applies no input sanitisation and no output
encoding. The API is not itself a browser context, so exploitability depends on
the consumer — but any consumer rendering this field as HTML inherits a stored
XSS, and the API should not be the weak link.

**Expected:** input rejected or neutralised at the boundary.
**Actual:** stored and reflected verbatim.

---

## DEFECT-009 — Failed authentication returns 200 OK
**Severity:** Medium · **Endpoint:** `POST /auth` · **Test:** TC-A-002

Bad credentials return `200 OK` with `{"reason":"Bad credentials"}`. A client
cannot use the status code to detect authentication failure and must parse the
body — easy to get wrong, and a naive `if (response.ok)` treats the failure as a
success.

**Expected:** `401 Unauthorized`.
**Actual:** `200 OK` with a reason in the body.

---

## DEFECT-010 — Missing credentials return 403 instead of 401
**Severity:** Low · **Endpoints:** `PUT`, `PATCH`, `DELETE /booking/{id}` · **Test:** TC-A-023

Omitting the token returns `403 Forbidden`. RFC 9110 §15.5.2 specifies `401
Unauthorized` when authentication is missing or invalid, with `403` reserved for
an authenticated principal that lacks permission. No `WWW-Authenticate` header is
returned, so a client cannot discover the expected auth scheme.

**Expected:** `401 Unauthorized` + `WWW-Authenticate`.
**Actual:** `403 Forbidden`, no header.

---

## DEFECT-011 — Error bodies ignore Accept: application/json
**Severity:** Low · **Endpoints:** all error paths · **Test:** TC-A-034

Error responses are `text/plain` ("Not Found", "Forbidden", "Internal Server
Error") even when the request sends `Accept: application/json`. Content
negotiation is not honoured, so a JSON client must special-case error parsing and
`response.json()` throws on every error path.

**Expected:** a JSON error body when JSON is requested.
**Actual:** `text/plain` regardless.

---

## DEFECT-012 — Writes to a non-existent id return 405, not 404
**Severity:** Medium · **Endpoints:** `PUT`, `PATCH`, `DELETE /booking/{id}` · **Test:** TC-A-026

All three verbs return `405 Method Not Allowed` for an id that does not exist.
`405` means the method is unsupported on an existing resource; the correct answer
for an absent resource is `404 Not Found`. Clients cannot distinguish "you used
the wrong verb" from "that booking is gone".

```
PUT    /booking/999999999 -> 405   (expected 404)
PATCH  /booking/999999999 -> 405   (expected 404)
DELETE /booking/999999999 -> 405   (expected 404)
```

---

## Summary

| ID | Severity | Endpoint | Defect |
|----|----------|----------|--------|
| DEFECT-001 | Low | POST /booking | 200 instead of 201, no Location header |
| DEFECT-002 | Medium | DELETE /booking/{id} | Returns 201 Created for a deletion |
| DEFECT-003 | Medium | DELETE /booking/{id} | Repeat delete returns 405, not idempotent |
| DEFECT-004 | **High** | POST /booking | Missing fields cause a 500, not a 400 |
| DEFECT-005 | **High** | POST /booking | Mistyped fields silently corrupted to null/true |
| DEFECT-006 | Medium | POST /booking | Negative totalprice accepted |
| DEFECT-007 | Medium | POST /booking | Checkout before checkin accepted |
| DEFECT-008 | **High** | POST /booking | Script payload stored and reflected unsanitised |
| DEFECT-009 | Medium | POST /auth | Failed auth returns 200 OK |
| DEFECT-010 | Low | PUT/PATCH/DELETE | 403 where 401 is correct |
| DEFECT-011 | Low | all errors | text/plain bodies ignore Accept: application/json |
| DEFECT-012 | Medium | PUT/PATCH/DELETE | 405 instead of 404 for an unknown id |

**3 High · 6 Medium · 3 Low**

The three High findings share one root cause: **there is no request validation
layer.** Input reaches persistence untyped, unsanitised and unchecked. Fixing
that one gap closes DEFECT-004, 005, 006, 007 and 008.
