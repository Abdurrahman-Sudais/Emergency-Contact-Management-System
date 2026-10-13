# InCase test plan and results

This plan covers the eight kinds of testing the project requires. Six are automated: run `npm test` to repeat them. Usability and responsive testing need people and devices, so they have step-by-step scripts with spaces for results.

**Latest automated run: 106 tests, 106 passed, 0 failed** (Node.js 24, Windows 11).

| Kind of testing | How | Test IDs | File |
|---|---|---|---|
| 1. Functional | automated | FUN-01 – FUN-12 | `tests/functional.test.js` |
| 2. Login / registration | automated | AUTH-01 – AUTH-14 | `tests/auth.test.js` |
| 3. Form validation | automated | VAL-01 – VAL-15 | `tests/validation.test.js` |
| 4. Security | automated | SEC-01 – SEC-32, PHOTO-01 – PHOTO-12 | `tests/security.test.js`, `tests/photo.test.js` |
| 5. Usability | manual script + automated label check | USE-01 – USE-09, UI-04 | below, `tests/pages.test.js` |
| 6. Responsive / mobile | manual script + automated checks | RES-01 – RES-08, UI-01, UI-06 | below, `tests/pages.test.js` |
| 7. Error handling | automated | UI-07 – UI-09, VAL-14, VAL-15, SEC-28 | `tests/pages.test.js` and others |
| 8. Database | automated | DB-01 – DB-12 | `tests/database.test.js` |

Each automated test starts a fresh copy of the app with an empty in-memory database and a fake clock. The clock lets tests check things like "locked for 15 minutes" without waiting. The tests talk to the app over real HTTP, the same way the pages do.

---

## 1. Functional testing

| ID | What is tested | Expected result |
|---|---|---|
| FUN-01 | Add three contacts | Saved in order 01, 02, 03; local number `0803…` stored as `+234803…` |
| FUN-02 | Move a contact up/down | Order changes; moving #1 up does nothing |
| FUN-03 | Edit a contact, tick "verified" | Changes saved, badge becomes Verified |
| FUN-04 | Search by name, label, phone digits | Only matching contacts returned |
| FUN-05 | Filter chips (Family, Medical, Needs review…) | Correct contacts and correct counts |
| FUN-06 | Delete a contact | Removed; the rest renumber with no gaps |
| FUN-07 | Home readiness checklist and activity | Ticks update as tasks are done; activity lists recent actions |
| FUN-08 | Update profile details | Name, phone and email saved |
| FUN-09 | Change password | Old password stops working, new one works |
| FUN-10 | Delete account | Wrong password refused; right password deletes user and contacts |
| FUN-11 | Last admin deletes their account | Refused, so the system is never left without an admin |
| FUN-12 | Admin: search, unlock, suspend, reinstate | Status changes and appears in the audit log |

## 2. Login and registration testing

| ID | What is tested | Expected result |
|---|---|---|
| AUTH-01 | Register a new account | Account created and signed in |
| AUTH-02 | Register with an email already used (different capitals) | Refused with a clear message |
| AUTH-03 | Register while sending `role: "admin"` | Account is still a normal user |
| AUTH-04 | Log in with correct details | Signed in, sent to Home |
| AUTH-05 | Wrong password vs. unknown email | Identical message, so emails can't be discovered |
| AUTH-06 | Five wrong passwords | Account locked 15 min; right password refused while locked; works after |
| AUTH-07 | Lockout logged | `account_locked` event in audit log |
| AUTH-08 | Suspended account logs in | Refused |
| AUTH-09 | `?next=//evil.example` after login | Ignored; goes to Home (no open redirect) |
| AUTH-10 | Log out, then reuse the old cookie | Rejected: the session was deleted on the server |
| AUTH-11 | Open private pages while signed out | Redirected to login |
| AUTH-12 | Call private API while signed out | 401 |
| AUTH-13 | Open public pages while signed out | Shown |
| AUTH-14 | Open login/signup while signed in | Redirected to Home |

## 3. Form validation testing

The same rules file (`public/js/validate.js`) runs in the browser and on the server. VAL-01 to VAL-07 test the rules. VAL-08 onwards send bad data straight to the server, skipping the browser, to prove the server enforces the rules on its own.

| ID | What is tested | Expected result |
|---|---|---|
| VAL-01 | Names | Letters (including Yoruba accents), spaces, `.` `'` `-`; 2–80 chars; `<script>` and SQL refused |
| VAL-02 | Emails | `amina@example` → "add the part after @, like amina@example.com" |
| VAL-03 | Passwords | 10+ characters and a symbol |
| VAL-04 | Nigerian phone numbers | `+234 803 555` → "needs 10 digits after +234. Add 4 more." |
| VAL-05 | International numbers | 8–15 digits; letters refused |
| VAL-06 | Phone formats | Stored as `+2348025550142`, shown as `+234 802 555 0142` |
| VAL-07 | Relationship | Only the five choices |
| VAL-08 | Signup with every field wrong | One message per field |
| VAL-09 | Bad contact sent directly to the API | Refused; nothing saved |
| VAL-10 | Arrays/objects/numbers instead of text | Refused cleanly, no crash |
| VAL-11 | Over-long note and label | Refused |
| VAL-12 | Bad profile email, blood group, allergies | Refused |
| VAL-13 | Wrong current password / weak new password | Refused |
| VAL-14 | Request over 20 KB | 413, refused |
| VAL-15 | Broken JSON | 400 with a plain message |

## 4. Security testing

Grouped by the ten safeguards on the app's Security page.

| Safeguard | ID | Attack or check | Expected result |
|---|---|---|---|
| 01 Authentication | AUTH-04 – AUTH-14 | (see section 2) | |
| 02 Password hashing | SEC-01 | Read the users table | Only `$argon2id$…` hashes; same password gives different hashes (salt) |
| 03 Role-based access | SEC-02 | User opens admin page / admin API | Redirected / 403 |
| | SEC-03 | | Attempt logged as `access_denied` |
| | SEC-04 | Admin promotes then demotes a user | Takes effect on the user's next request |
| | SEC-05 | Admin suspends a signed-in user | That user is signed out immediately |
| | SEC-06 | Admin tries to demote/suspend themself | Refused |
| | SEC-07 | Admin reads account list | Contains no contacts, notes or hashes |
| 04 Input validation | VAL-01 – VAL-15 | (see section 3) | |
| 05 SQL injection | SEC-08 | `' OR '1'='1' --` as login email | Not logged in |
| | SEC-09 | `' OR 1=1 --`, `'; DROP TABLE contacts; --`, `%`, `_` in search | No extra results; table still there |
| | SEC-10 | SQL inside a contact label | Stored as plain text |
| 06 Cross-site scripting | SEC-11 | `<script>` / `<img onerror>` in a note | Returned as JSON text |
| | SEC-12 | Scan page scripts | No `innerHTML`, `insertAdjacentHTML` or `document.write` |
| | SEC-13 | Read CSP header | `script-src 'self'`, no `unsafe-inline` |
| 07 Session management | SEC-14 | Read the cookie | `HttpOnly; SameSite=Lax` |
| | SEC-15 | Over HTTPS | Cookie also `Secure` |
| | SEC-16 | Attacker plants a session id, victim logs in | New id issued (no session fixation) |
| | SEC-17 | Read sessions table | Only SHA-256 hashes of tokens |
| | SEC-18 | 15 minutes idle | Signed out; activity resets the timer |
| | SEC-19 | Active for 12+ hours | Signed out |
| | SEC-20 | Change password on one device | Other devices signed out |
| | SEC-21 | Request with missing/forged CSRF token | 403; nothing saved |
| | SEC-22 | Cross-site HTML form post | 415; refused |
| 08 Access control | SEC-23 | User B edits/moves/deletes user A's contact | 404; A's data unchanged |
| | SEC-24 | Compare with a non-existent id | Identical answer (can't probe ids) |
| | SEC-25 | | Attempts logged |
| 09 Sensitive information | SEC-26 | Read database directly | Allergies and notes encrypted; owner still sees them |
| | SEC-27 | Read API responses | No hashes, session ids or internal fields |
| | SEC-28 | Trigger errors | No stack traces |
| | SEC-29 | Request `/.env`, `/server.js`, the database | 404 |
| 10 HTTPS and headers | SEC-30 | Read headers on pages, CSS, API | nosniff, DENY, no-referrer, CSP; no `X-Powered-By` |
| | SEC-31 | API caching | `Cache-Control: no-store` |
| | SEC-32 | HTTP with HTTPS forced | 301 to https; POST refused; HSTS over HTTPS |

### Profile photo uploads

| ID | Attack or check | Expected result |
|---|---|---|
| PHOTO-01 | Upload a real PNG | Saved; shows in the session; downloads byte-for-byte |
| PHOTO-02 | Upload a JPG carrying GPS location (EXIF) | Location data removed before saving |
| PHOTO-03 | Upload a PNG with hidden text | Hidden text removed |
| PHOTO-04 | Script text sent as "image/png" | Refused: the file is judged by its real contents, not its label |
| PHOTO-05 | Cut-off / damaged image | Refused |
| PHOTO-06 | SVG, HTML, unknown types | Refused (SVG can contain scripts) |
| PHOTO-07 | File over 2 MB | Refused with "Photos can be up to 2 MB" |
| PHOTO-08 | Upload without CSRF token | 403 |
| PHOTO-09 | Signed out | Can't read or upload (401) |
| PHOTO-10 | Another user asks for "the photo" | Only ever gets their own |
| PHOTO-11 | Photo response headers | `nosniff`, `sandbox` CSP, shown inline: the browser can't treat it as a page |
| PHOTO-12 | Remove photo; delete account | Photo gone in both cases |

The browser also shrinks photos to 512px before sending them. That makes uploads quick and drops hidden metadata, but the server checks run on every upload regardless.

### Manual security checks (browser)

Do these once in a real browser and note the result.

| ID | Steps | Expected | Result |
|---|---|---|---|
| MSEC-01 | Add a contact named normally with note `<img src=x onerror=alert(1)>`, open Contacts | Note shows as text, no pop-up | |
| MSEC-02 | DevTools → Application → Cookies | `sid` is HttpOnly; `document.cookie` in the console doesn't show it | |
| MSEC-03 | Sign in, wait 16 minutes, click anything | Sent to login with "signed out after 15 minutes" | |
| MSEC-04 | As a normal user, type `/admin.html` in the address bar | Back on Home with "administrators only" | |
| MSEC-05 | `npm run cert`, set TLS vars, open `http://localhost:3000` | Redirected to `https://localhost:3443` | |

## 5. Usability testing

**Who:** 5 people who haven't seen the app (a mix of phone and laptop users; at least one older adult).
**How:** give each person the tasks below one at a time. Don't help. Time each task and note where they hesitate. Afterwards they answer the questionnaire.

| ID | Task given to the tester | Success means | Target |
|---|---|---|---|
| USE-01 | "Create an account for yourself." | Reaches the tour | under 2 min |
| USE-02 | "Add your brother as the person to call first." | Contact saved from step 4 | under 1 min |
| USE-03 | "Add two more people: your doctor and a neighbour." | 3 contacts on Home | under 2 min |
| USE-04 | "Make the doctor the first person called." | Doctor shows as 01 | under 1 min |
| USE-05 | "Find your neighbour's number using search." | Uses search box | under 30 s |
| USE-06 | "Add that you're allergic to penicillin." | Saved on Profile | under 1 min |
| USE-09 | "Put a photo of yourself on your profile." | Photo shows in the top bar | under 1 min |
| USE-07 | "Call the first person." (on a phone) | Taps the orange Call button; dialer opens | under 10 s |
| USE-08 | "Sign out." | Back on the login page | under 20 s |

Record for each tester: task completed (Y/N), time, number of wrong clicks, comments.

| Tester | USE-01 | USE-02 | USE-03 | USE-04 | USE-05 | USE-06 | USE-07 | USE-08 | USE-09 | Comments |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | |
| 2 | | | | | | | | | | |
| 3 | | | | | | | | | | |
| 4 | | | | | | | | | | |
| 5 | | | | | | | | | | |

**Questionnaire** (1 = strongly disagree … 5 = strongly agree):
1. I could find what I needed without help.
2. The error messages told me how to fix the problem.
3. The text and buttons were easy to read and tap.
4. I would trust this app with my emergency contacts.
5. I would use this app.

Built-in usability features to point out in the report: error messages say how to fix the problem ("Add 4 more"), password rules tick off as you type, every field has a label (UI-04), buttons are at least 44px tall for easy tapping, and dangerous actions (delete) ask for confirmation.

## 6. Responsive and mobile testing

Automated: every page has the mobile viewport tag (UI-01), and the CSS has phone (≤700px) and tablet (≤800px) layouts (UI-06).

Manual: open each page at each size. In Chrome, use DevTools → device toolbar, and also try at least one real phone.

| ID | Device / width | Check | Result |
|---|---|---|---|
| RES-01 | iPhone SE (375px) | No sideways scrolling on any page | |
| RES-02 | iPhone 14 (390px) | Bottom tab bar replaces the top menu; Home shows "Hi, name" | |
| RES-03 | Android (412px) | Contacts: buttons wrap under each contact and are easy to tap | |
| RES-04 | Phone | Add-contact drawer fills the screen; keyboard doesn't hide Save | |
| RES-05 | Phone | Tapping "Call" opens the dialer with the right number | |
| RES-06 | iPad (768px) | Login/signup show only the form (side panel hidden) | |
| RES-07 | Laptop (1280px) | Layout matches the design (two-column Home, side panel on login) | |
| RES-08 | Phone landscape | Pages still usable | |

## 7. Error handling testing

| ID | What is tested | Expected result |
|---|---|---|
| UI-07 | Unknown page | Friendly 404 page |
| UI-08 | Contact ids `999`, `abc`, `-1`, `1.5`, `0` | 404, no crash |
| UI-09 | Broken JSON and broken URL, then a normal request | Server keeps working |
| VAL-14 | Very large request | 413 |
| VAL-15 | Broken JSON | 400 with a plain message |
| SEC-28 | Any error | No stack trace or internal detail |
| (manual) | Stop the server, then click Save in the browser | Message shown, page doesn't freeze | |

## 8. Database testing

| ID | What is tested | Expected result |
|---|---|---|
| DB-01 | Tables exist | users, contacts, sessions, audit_log, photos |
| DB-02 | Duplicate email (any case) | Rejected by the database |
| DB-03 | Unknown role or status | Rejected (CHECK constraint) |
| DB-04 | Plain-text password stored | Rejected: must be an Argon2id hash |
| DB-05 | Bad relationship or non-international phone | Rejected |
| DB-06 | Contact for a user that doesn't exist | Rejected (foreign key) |
| DB-07 | Delete a user | Their contacts and sessions are deleted too (cascade) |
| DB-08 | Delete contacts from the middle | Positions stay 1..n |
| DB-09 | Query another user's contact | Nothing returned/changed |
| DB-10 | Error halfway through a transaction | Nothing saved (rollback) |
| DB-11 | Encrypted note | Reads back correctly; one flipped bit is detected |
| DB-12 | Account deleted | Its activity history is gone too |
