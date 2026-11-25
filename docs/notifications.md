# Server notifications

Deploy the generated `deployment/Code.gs`, `deployment/Index.html` and `deployment/appsscript.json` together. The inbox tables are created lazily; existing browser alerts are not imported or replayed.

In Apps Script Project Settings > Script Properties, set:

- `REPORT_EOD_TIME`: company EOD as 24-hour IST `HH:mm` (default `18:30`).
- `REPORT_REMINDER_MINUTES`: minutes before EOD (integer 5?180, default `30`). The reminder must fall on the same IST day.

Run `installNotificationSchedule_()` once from the Apps Script editor as the deployment owner and authorize the added script trigger scope. Rerunning it keeps one trigger for this handler under that owner. Verify the trigger in the Apps Script Triggers screen. The timer runs every five minutes; each execution checks the current Asia/Kolkata date/time. Timer execution may be delayed by Apps Script; this is a reminder window, not an exact-minute guarantee. The default window is 18:00?18:30 IST. Do not install the same schedule under multiple owner accounts.

The scheduler creates one event per employee and IST date, excluding non-working days, holidays, approved full-day leave (WFH still requires a report), and dates with a submitted report. Half-day leave still requires a report. A report submitted or leave approved after a reminder was queued suppresses that reminder in the inbox. Delivery retries run through the server timer and authenticated inbox reads even if no browser tab was open at the scheduled time. This is an in-app inbox; there are no new browser push or email deliveries.

Record events are created only after storage writes succeed. Reports queue events after their history and audit writes. The persisted event queue captures its recipient list and retries partially delivered events using a deterministic event/recipient receipt ID under a script lock. Refresh/login/tab activity reads this queue rather than reconstructing events from workspace state. Identical task writes do not create another event; subsequent actual changes do. Notification queue failures are logged without rolling back saved business records. If the event queue itself cannot be written, that event cannot be retried; inspect execution logs for `Notification queue failed`.

Read, dismiss and popup-delivery receipts live in Sheets. Opening the bell or dismissing a popup does not read notifications. Individual read, mark all read and clear operations are restricted to the authenticated recipient. Current record visibility is checked again when listing and opening notifications; reassigned work loses access immediately. Removed items show an unavailable message and never return the queued snapshot. TL visibility follows assigned/reporting team; employees receive their own records and shared announcements. Admin/HR have workspace visibility but cannot access another recipient's inbox receipt.

The old browser diff/memory utilities remain only for legacy regression coverage; the bell no longer imports or uses them. Existing business history is not backfilled with notifications.

Validation: `node --test tests/server-notifications.test.mjs`, `npm test`, `npm run build`.

Clock trigger API: https://developers.google.com/apps-script/reference/script/clock-trigger-builder


Punch and message alerts:
- `PUNCH_IN_TIME` defaults to `09:30`; `PUNCH_OUT_TIME` defaults to `18:30`, both IST `HH:mm`.
- One punch-in reminder in the 30-minute window starting at shift start if no punch-in exists. One punch-out reminder in the 30-minute window starting at shift end if a punch remains open. Non-working days and approved full-day leave are skipped; WFH still requires attendance. Reminders disappear once completed or on the next IST day.
- Successful punches create private attendance confirmations. Failed punches create no confirmation.
- New direct messages create a notification only for the recipient, including when the sender/recipient is Admin or HR. Message previews show only the sender, without message content. Message clicks open that sender's conversation. Reading the conversation resolves its matching bell receipt. The bell's mark-read action acknowledges the alert, not the conversation.
- All notification popups share a bounded queue, shown one at a time; claims pause when full. Inbox pages use stable cursors and global unread counts. A separate message popup is disabled to prevent duplicate delivery. Visible tabs poll every 10 seconds; closed tabs receive reminders in the persisted inbox on reopening, not an OS push notification.

Recovery, permissions, preview privacy, pagination and migration details: [password recovery upgrade](password-recovery.md).
