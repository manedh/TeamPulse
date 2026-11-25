# Password recovery and notification review

## What changed

The email-first Continue action always opens the password screen. Its unauthenticated `checkAccount` response no longer returns `exists` or reads credentials. Users can choose Forgot password (email prefilled) or explicitly Create account. Existing registration and approval rules remain. The legacy self-registration endpoint still reports an already-registered account; administrators wanting a completely non-enumerable onboarding system should use invitation-only registration as a separate change.

`requestPasswordReset` returns the same acknowledgement for existing, unknown, disabled, unprovisioned, throttled and mail-failure cases. Invalid inputs and missing configuration have uniform actionable errors. It applies a 2.5-second response floor, a 60-second per-normalized-email resend cooldown, five attempts per email per hour and twenty requests overall per fifteen minutes. Suppressed attempts count toward limits. Reset submissions are limited to fifty per fifteen minutes overall. The time floor reduces account-dependent latency differences; Apps Script, Sheets and SMTP network latency are not constant-time. Measure deployed paths before relying on timing equalization under load.

An owner-generated 256-bit secret and the supported Utilities HMAC-SHA256 API produce pseudorandom reset tokens from a lock-protected monotonic counter and UUID nonce. UUIDs supply uniqueness, not assumed cryptographic entropy. Tokens are never generated with Math.random or timestamps. The new `passwordResets` sheet stores token hashes, employeeId, expiry, usedAt, createdAt, and credential/email binding hashes. Tokens expire after 15 minutes, are single-use and are invalidated by a replacement, account/email/status change, or password change. No token plaintext or password is stored in that sheet. Reset emails contain the token only in a URL fragment. The React entry removes it from the address bar immediately, retains it only in memory, and sends it in the POST body. Refreshing that stripped reset page requires reopening the email link. No analytics is installed on the recovery route; any future instrumentation must redact request bodies and URL fragments.

The backend script lock covers validation and consumption. It burns the token before revoking sessions and saving a new bcrypt cost-12 hash under the unchanged 12-character / 72-UTF-8-byte policy. Partial storage failures fail closed: request a fresh link if the old one was consumed. Successful reset signs out all previous sessions and returns to sign-in without creating a session. Confirmation email contains no password. Recovery email uses the authenticated Vercel SMTP function and enforces STARTTLS on port 587. SMTP failures are logged in Vercel and Apps Script server logs; credentials, reset tokens and message bodies are not logged.

## Required configuration

Set these in Vercel Project Settings > Environment Variables (server-side only; never use `VITE_`):

| Variable | Value |
| --- | --- |
| `APP_URL` | Actual public TeamPulse HTTPS origin, e.g. `https://your-project.vercel.app`, without a path. This generates the reset link. |
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` (STARTTLS required) |
| `SMTP_USER` | `c4e39d001@smtp-brevo.com` |
| `SMTP_PASS` | Your Brevo SMTP key. Do not put it in source control or chat. |
| `MAIL_FROM` | `teampulse7875@gmail.com`; verify this sender in Brevo first. |
| `MAILER_API_SECRET` | Random secret of at least 32 characters; also set this identical value in Apps Script Script Properties. |
| `APPS_SCRIPT_URL` | Existing server-side Google Apps Script `/exec` URL, as before. |

In Apps Script Project Settings > Script Properties, set `APP_URL` to the same public origin as above, `MAILER_API_SECRET` to the same shared secret, and `PASSWORD_RESET_SECRET` to 64 lowercase hex characters generated from 32 cryptographically random bytes. Preserve the existing `SPREADSHEET_ID`, report and punch properties.

Generate the two distinct secrets locally, then paste them directly into the appropriate settings. Run the command separately for each secret; do not reuse one value for both. Generate each with:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

The `APP_URL` Script Property is used by Apps Script to call the protected Vercel mail endpoint; the Vercel function uses its `APP_URL` environment variable to build the public reset URL. Keep both identical. `PASSWORD_RESET_COUNTER`, `RESET_REQUEST_GLOBAL`, `RESET_SUBMIT_GLOBAL` and hashed `RESET_EMAIL_*` properties are maintained by the backend. Do not reset the counter during normal operations. SMTP credentials remain on Vercel only. No email credential or secret is exposed to React.

## Migration and Apps Script deployment (manual)

1. Run `npm test` and `npm run build` locally. These do not publish anything.
2. In the existing Apps Script project, replace Code.gs and Index.html with generated `deployment/Code.gs` and `deployment/Index.html`. Update `appsscript.json` from the generated manifest. Keep the existing project, properties, workbook and deployment identity.
3. Configure the recovery Script Properties above. Run `preparePasswordRecovery_()` from the editor as owner. This validates configuration and adds only the missing passwordResets sheet and headers. It validates existing headers instead of replacing them. It does not create or repair Admin accounts, clear Sheets or modify credentials. **Do not rerun initial-admin `setup()` for this upgrade.** Notification sheets are also created additively on first use.
4. Approve the manifest's Sheets, `script.send_mail` and `script.scriptapp` scopes. The mail scope continues to support Apps Script notifications; password recovery sends through the Vercel SMTP function. The script scope manages the reminder trigger.
5. Run `installNotificationSchedule_()` as the same owner. It validates times, creates a five-minute trigger only if absent and removes duplicate handlers visible to that owner. Verify one `processNotificationSchedule_` trigger. Triggers belonging to another account cannot be deduplicated by this account; use one owner.
6. Manually create a new version of the existing web-app deployment. Preserve its access setting and execute-as-owner configuration. Updating source alone does not update the `/exec` deployment.

If SMTP delivery fails, the unsent reset token is invalidated and the user still receives a generic acknowledgement; inspect Vercel Function Logs and Apps Script Executions for the SMTP diagnostic, then allow the user to retry after the cooldown. Confirmation-email failure does not undo a successful password change.

## Vercel deployment (manual)

Preserve `APPS_SCRIPT_URL` and configure the SMTP variables above. Redeploy Vercel after setting environment variables. The existing `/reset-password` rewrite serves the reset form directly and keeps no-store, no-referrer and noindex headers for the recovery path. Test a direct email link in a fresh browser; it must load the reset form without visiting the home page first. For a local delivery check, copy `.env.example` to `.env.local`, set `SMTP_PASS`, then run `npm run test:email -- recipient@example.com`.

## Notification review

Events are deduplicated at enqueue against the latest equivalent event snapshot and have deterministic event IDs; receipt IDs remain deterministic per event and recipient. All delivery/receipt writes stay under the script lock. Actor suppression removes routine self-notifications, while personal punch confirmations remain useful. Name/phone/photo-only profile edits do not queue events. Task labels distinguish assignment, reassignment, status changes and other updates. Message bodies, leave reasons, report details and punch locations are excluded from previews, including old message receipt text when serialized again. Only authorized record-open responses return the actual underlying details.

Request-local row caching returns copies and invalidates on storage writes, reducing repeated Sheets reads without sharing cached private data across requests. The inbox returns up to 50 items by default (maximum 100), with a stable timestamp/ID cursor. Unread totals and bulk read/dismiss operations apply to the full authorized visible inbox. Popup claims are limited to five per poll, separate from the displayed page; remaining claims wait when the 100-item client popup queue is full. Multiple tabs cannot claim the same receipt. Deleted and reassigned records recheck current access. Delivery failures leave source work saved; if the event queue itself cannot be written, that event has no durable retry record and a fixed-context failure is logged.

Daily reminders exclude report submissions, full-day approved leave (WFH still requires reporting), holidays, weekly offs, inactive employees and dates before joining. Resolved report reminders drop out of visible/unread results. Scheduling uses Asia/Kolkata and configurable EOD/lead time. The clock trigger operates within a time window; it is not an exact-minute guarantee.

These are **in-app notifications**, not browser/OS push. Closed tabs do not show popups; the server can queue reminders, and the app receives them on reopening. See also [notification setup](notifications.md).

## Verification

Local run on 24 November 2026: **422 tests passed**; production Vite build and combined Apps Script packaging passed. The build retains the existing large-bundle advisory.

Automated coverage includes real local HMAC/bcrypt calculations, reset expiry/reuse/replacement, cooldown/rate limits, invalid/status/email/credential binding, session revocation, mail/quota failures, additive migration, generic account continuation, and sequential/reentrant contention under a simulated script lock. Notification tests cover permissions, duplicate retries, multi-tab claims, persisted read/dismiss state, pagination/global counts, preview privacy, Sheet-read caching and reminder exclusions. React server-render smoke checks and production packaging validate the recovery UI and routes structurally.

Still requires live verification after manual deployment: Google authorization/quotas and actual email receipt/spam placement; direct Vercel links and header behavior; real simultaneous HTTP reset requests against Google's script lock; network timing for known/unknown/throttled email paths; click-through browser UX, two-tab popup behavior; trigger execution, owner identity, quota/runtime and actual IST reminder delivery. No production deployment, email send, Sheet migration, credential reset or trigger installation was performed by these local tests.
