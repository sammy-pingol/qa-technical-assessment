# Traceability Matrix

Assessment requirement → test case → implementing spec.

## Case study coverage

| Requirement (from the brief) | Test cases | Spec file |
|------------------------------|-----------|-----------|
| 1a — Validate the logo and login button are displayed | TC-W-001 … TC-W-010 | `tests/web/header.spec.ts` |
| 1b — Tests for searching flights | TC-W-020, TC-W-021/022/023 (one journey), TC-W-024 … TC-W-028 | `tests/web/flight-search.spec.ts` |
| 1c — Assertions for flight search results | TC-W-040 … TC-W-048 | `tests/web/search-results.spec.ts` |
| 2a — CreateBooking with response field assertions | TC-A-010 … TC-A-019 | `tests/api/create-booking.spec.ts` |
| 2b — UpdateBooking with response field assertions | TC-A-020 … TC-A-026 | `tests/api/update-booking.spec.ts` |
| 2c — GetBooking with response field assertions | TC-A-030 … TC-A-036 | `tests/api/get-booking.spec.ts` |
| 2d — DeleteBooking with response field assertions | TC-A-040 … TC-A-046 | `tests/api/delete-booking.spec.ts` |
| — Auth (precondition for 2b and 2d) | TC-A-001 … TC-A-003 | `tests/api/auth.spec.ts` |

## "MUST HAVES" coverage

| Must have | Where it is satisfied |
|-----------|----------------------|
| **Positive tests** | TC-W-001…008, 020…024, 040…046 · TC-A-001, 010…013, 020…022, 030…033, 040…042 |
| **Negative tests** | TC-W-009, 010, 025…028, 047, 048 · TC-A-002, 003, 014…019, 023…026, 034…036, 043…046 |
| **API response field assertions** | `expectValidBookingShape()` and `expectBookingEquals()` in `tests/api/support/assertions.ts`, applied in TC-A-010, 012, 020, 021, 022, 030. Type, format, presence and round-trip equality for `firstname`, `lastname`, `totalprice`, `depositpaid`, `bookingdates.checkin`, `bookingdates.checkout`, `additionalneeds` and `bookingid`, plus content-type and undocumented-field checks (TC-A-031). |
| **Location / position of web element assertions** | TC-W-003 (logo inside header band, left half, near top) · TC-W-004 (Sign in right half, flush to edge, inside header) · TC-W-005 (shared horizontal axis, no overlap) · TC-W-006 (order relative to the nav toggle) · TC-W-007 (fully inside the viewport) · TC-W-008 (header spans full width) · TC-W-009 (no overflow at 375px) · TC-W-045 (result cards stack vertically, contained by their list). Geometry helper: `boxOf()` in `tests/web/pages/base.page.ts`. |

## Defect traceability

| Defect | Raised by |
|--------|-----------|
| DEFECT-001 | TC-A-010 |
| DEFECT-002 | TC-A-040 |
| DEFECT-003 | TC-A-045 |
| DEFECT-004 | TC-A-014 |
| DEFECT-005 | TC-A-016 |
| DEFECT-006 | TC-A-017 |
| DEFECT-007 | TC-A-018 |
| DEFECT-008 | TC-A-019 |
| DEFECT-009 | TC-A-002 |
| DEFECT-010 | TC-A-023 |
| DEFECT-011 | TC-A-034 |
| DEFECT-012 | TC-A-026 |
