# TeamPulse - this Sheet is already configured

Sheet: https://docs.google.com/spreadsheets/d/1zsY6TWHvstFcN39kAGQziLwJG-jztdGwllS3SU-RxLs/edit

Builds produce the local upload package. Updating the live deployment and verifying real Sheet writes are separate steps.

## Remaining account steps

1. Open the linked Sheet in your Google account. Select Extensions > Apps Script.
2. Run `npm run build`, then paste deployment/Code.gs into the editor's Code.gs. It already contains the backend, authentication and bcrypt library; do not also add separate Auth.gs/Bcrypt.gs copies. Add an HTML file named Index and paste Index.html.
3. Project Settings: enable the manifest and replace appsscript.json with the supplied manifest.
4. Script Properties: add ADMIN_EMAIL (your email) and ADMIN_INITIAL_PASSWORD (a new TeamPulse password of at least 12 characters, maximum 72 UTF-8 bytes). Enter the password privately in Google, not in chat. SPREADSHEET_ID is already configured in Code.gs and does not need another property.
5. Select setup from the function dropdown and click Run. Approve the requested Google spreadsheet permission. Setup creates employees, projects, tasks, attendance, worklogs, leaves, announcements, messages, settings, accessEvents, audit, credentials and sessions tabs. The initial password is hashed, then removed from Script Properties.
6. Deploy > New deployment > Web app. Execute as yourself. Set Who has access to Anyone (not Anyone with a Google account), as approved by the owner. Existing deployments: Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy. Upload the supplied manifest as well if needed. The live setting must be saved in Google; changing local files alone does not update it. Open the returned /exec URL and log in with the initial Admin credentials.
7. Test a new account: new email > create password/profile > approve in Employees as Admin > log in as that employee > punch in/out. Check the corresponding spreadsheet rows. Create a project/task as Admin and verify those rows too.

If organization policy prevents the Anyone option, the owner must resolve that policy restriction. Keep the underlying spreadsheet private.

For local development after a reachable deployment is available, set APPS_SCRIPT_URL in .env.local and restart npm run dev. The proxy can connect only after Google allows requests without a Google browser session. TeamPulse itself still validates app sessions.

To regenerate this folder after changes:

    npm run build

A separate .gs file may be used instead of the combined file, but never include both forms together. BCRYPT-LICENSE.txt is retained for the vendored library. No account secrets are included in this package.

## If the frontend reports an outdated backend

Replace Code.gs with the complete generated deployment/Code.gs (including authentication and bcrypt); do not leave older Auth.gs or Bcrypt.gs alongside this combined file. Replace Index with the complete deployment/Index.html. Save both, then edit the existing deployment and choose New version before deploying. Reopen its /exec URL.

When using Vercel or localhost, APPS_SCRIPT_URL must point to this updated deployment. Creating a different deployment leaves an old configured URL serving old code. If the URL changed, update the local or hosting environment and restart/redeploy the frontend. Updating HTML alone does not update backend actions.

## Work-from-home requests

Open Leave / WFH requests > Request leave / WFH and select Work from home (WFH). Enter the dates, full-day or half-day duration, and reason. WFH requests use the configured working calendar and designated approver; employees can edit or delete their own pending requests. Overlapping leave and WFH requests are blocked. WFH is stored as its own request type in the existing leaves sheet. Attendance punch-in and punch-out remain separate.

Deploy both updated Code.gs and Index.html from the deployment folder using a new Apps Script deployment version to enable this feature live.

## Teammate messaging

Open Messages in the sidebar, then search and select any active employee, Admin, Team Leader or HR member. Type your message and select Send message. The Messages panel lists all active members and unread counts, across departments. It refreshes every 10 seconds while this page is visible; open a conversation to read replies. Messages support up to 2,000 characters. Only the sender and recipient can retrieve a conversation through the app, including for Admin/HR users. Spreadsheet owners retain direct access to the underlying sheet.

The messages sheet is created automatically on the first send, or by setup(). Deploy the updated Code.gs and Index.html as a new Apps Script version. Existing spreadsheet records are preserved.

If only existing chat contacts appear, the live backend is still serving an older version. Replace Code.gs with deployment/Code.gs, save, then select Deploy > Manage deployments > Edit > Version: New version > Deploy. Update Index.html as well when hosting the frontend in Apps Script. For localhost or Vercel, ensure APPS_SCRIPT_URL points to that updated deployment. Clear the member search after reloading.

## Team leader group requests

In Leave / WFH requests > Request leave / WFH, Team Leaders and Admins can choose Apply for > Team / group. Select individual team members or Select all (including the leader), then enter the shared request type, dates, duration and reason. All active members are available, including members without assigned projects or tasks. Every member gets a separate pending request with a shared Group ID. All requests are checked before saving; a conflict prevents the whole submission. The submitter can track these requests but cannot approve them; another eligible HR/Admin is used if the submitter was the configured approver. Employees retain control of their own pending requests. Deploy both generated Code.gs and Index.html as a new version.

## Google Sheets backend storage

All business records use the configured private spreadsheet through Apps Script. The local/Vercel frontend forwards requests to APPS_SCRIPT_URL; the Apps Script-hosted frontend calls the same backend directly.

| Feature | Sheet tab |
| --- | --- |
| Accounts, roles and profiles | employees |
| Password hashes and login sessions | credentials, sessions |
| Projects and task progress | projects, tasks |
| Punch times, work mode and locations | attendance, accessEvents |
| Individual/group leave and WFH requests | leaves |
| Announcements and teammate messages | announcements, messages |
| Working days, holidays and leave approver | settings (leavePolicy) |
| Audit history and legacy work logs | audit, worklogs |

Existing LEAVE_POLICY Script Properties remain readable until a Sheet policy is saved. Running setup copies an existing legacy policy into settings without replacing a saved Sheet policy. Saving Leave settings creates the settings tab if missing. Raw settings are not included in client bootstrap data; only the leave policy is returned. Runtime deployment configuration and authentication rate limits remain in Script Properties. Browser theme and notification-read preferences remain local.

After uploading the generated files and deploying a new version, sign in and verify a real create/update in the corresponding tab. An unauthenticated bootstrap checks API reachability only; it cannot verify real record writes. No live deployment or authenticated Sheet writes were performed by the local build.
