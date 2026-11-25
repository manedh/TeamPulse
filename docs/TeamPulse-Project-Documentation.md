# TeamPulse Project Documentation
Sawai Associates employee management portal
Prepared on 29 October 2026

TeamPulse brings employee administration, projects, tasks, attendance, leave requests and company announcements into one web application. This document explains the current implementation, how data moves through the system, and how to maintain and deploy it.

The frontend uses React and Vite. Google Apps Script provides the backend API, while a private Google Sheet stores business records and authentication data. The app can run directly as an Apps Script web app or use Vercel for the frontend and proxy.

## Technology stack
- React 19 and React DOM provide the application interface.
- Vite 6 provides local development and production builds.
- JavaScript, JSX and CSS implement application behavior and styling.
- Google Apps Script runs backend validation, permissions and storage operations.
- Google Sheets stores persistent records.
- bcryptjs hashes passwords and verifies logins.
- ExcelJS generates attendance spreadsheets.
- Lucide React supplies interface icons.
- Node.js 22 is the declared development runtime.

## Architecture
Apps Script hosting: Browser > React > google.script.run > Apps Script API > Google Sheets.

Local or Vercel hosting: Browser > React > /api/teampulse > server proxy > Apps Script API > Google Sheets.

Protected backend actions validate the session, account status, permissions and submitted fields before performing the operation. The result is returned to the frontend to update the interface. Hiding a button is not the permission boundary.

## Verification status
The 4 November 2026 verification completed with 363 passing automated tests and a successful production build, including Daily Work Report permission, history, summary and Excel round-trip checks. Desktop light-mode and mobile dark-mode report screens were inspected with isolated test data. Tests use mocked Google services and screen rendering. The latest live deployment version and real Google Sheet writes have not been confirmed from this environment.
[[PAGE]]
# Application Modules and Roles

## Available modules
- Overview presents dashboard and work summaries.
- Employees provides employee administration for Admin and HR. Other users see the Teammates view with a limited directory and attendance summaries.
- Projects stores project name, description, owner, department, due date and status.
- Tasks supports assignment, descriptions, priorities, statuses, optional due dates and attachment links.
- Attendance records punch times, work mode and location, calculates hours, and supports administrative Excel exports.
- Leave requests supports applying, editing or deleting eligible pending requests, approval and rejection.
- Announcements shares company notices.
- Settings includes appearance, profile name, joining date and password changes. Administrative settings include leave policy, department assignments and initial password provisioning.

The Worklogs screen has been removed. Legacy storage and backend support remain for existing records.

## Roles and permissions
Admin manages employee accounts, privileged roles and organization-wide records, subject to backend safeguards.

HR performs permitted employee, attendance, leave and business-record administration. HR cannot use restricted privileged-account operations reserved for Admin.

Team Leader manages owned projects and related tasks. Access to associated records follows backend ownership and assignment rules.

Employee accesses assigned work, personal attendance, leave requests and profile settings. Administrative employee fields cannot be changed through the profile form.

Record permissions differ by operation. Attendance corrections and Excel exports are available to Admin and HR. Task status changes are permitted for assigned users or authorized managers. Employee deletion includes checks against deleting one's own account and removing the last active Admin.

## Registration flow
A user enters an email first. Existing credentials lead to password entry. A new user supplies profile details and a password. Registration creates an Employee account with Pending status; Admin or HR must approve it before login.

Email is an account identifier. Google sign-in, email OTP and electronic ownership verification are not implemented. Administrators need to verify identity during approval.
[[PAGE]]
# Authentication and Data Storage

## Password handling
Passwords are stored as bcrypt hashes rather than readable text. Auth.gs calls bcrypt.hashSync to create hashes and bcrypt.compareSync to verify passwords. The bcrypt cost factor is 12.

Passwords require at least 12 characters and may occupy at most 72 UTF-8 bytes. Five failed password attempts trigger a 15-minute lockout. Authentication operations also have request rate limits.

Bcrypt.gs is the bundled library used by Apps Script. BCRYPT-LICENSE.txt must remain with distributed copies. Preserve the synchronous Apps Script compatibility patch when updating the library.

## Sessions
Successful login creates a token. The browser keeps it in sessionStorage; Sheets stores its SHA-256 hash. Sessions expire after eight hours. Protected requests check the session and current employee status. Logout revokes the session, and password changes revoke the employee's existing sessions.

## Storage tables
- employees: identity, email, role, department, designation, status and joining date.
- projects: project details, ownership, dates and status.
- tasks: assignment, description, priority, due date, status and links.
- attendance: employee, IST working date, punch timestamps and work mode.
- accessEvents: punch location coordinates, accuracy and capture status.
- leaves: requested dates, duration, reason, approver, decision and rejection reason.
- announcements: company notices and creation timestamps.
- credentials: password hashes, failed attempts, lockout and login metadata.
- sessions: token hashes, expiry and revocation.
- audit: actor, action, target and timestamp.
- worklogs: retained legacy work-log records.

Leave policy is also stored in Apps Script properties. Supported legacy employee and attendance layouts gain joiningDate and workMode columns without requiring deletion of existing records.

## Security boundaries
The Google Sheet should remain private. The web-app entry point and access to business records are separate: application sessions and roles control protected API actions. Direct edits to the Sheet bypass application validation. Sheets writes do not have full database transaction guarantees.
[[PAGE]]
# Attendance Leave and Daily Work

## Attendance behavior
Select WFO for Work from office or WFH for Work from home before punching in. The selection is saved with the session and stays locked until punch-out. Older records without a mode display Not specified.

The backend generates punch timestamps. Working dates and interface time formatting use IST. The current interface captures browser location before saving a punch and stops the operation if capture fails. Coordinates come from the device; office-boundary or geofence validation is not implemented in the inspected code.

An open session prevents duplicate punch-in. After punch-out, another session can start. Worked hours use the full punch-in-to-punch-out interval, including time outside a scheduled shift. Gaps between sessions are excluded. Daily totals finalize when all sessions for that day are closed.

Attendance snapshots refresh approximately every 10 seconds while the page is visible, and also refresh when the page regains focus. Admin and HR can filter by employee and date range and export Excel files containing work mode and punch times.

## Leave management
Requests support leave types, date ranges, full-day or half-day duration and a reason. Working days and holidays influence calculated totals. Policy can designate an approver. Approval and rejection are permission checked; rejection requires a reason. Eligible pending requests can be edited or deleted, and overlap validation applies.

New leave/WFH emails use asawai7875@gmail.com, bhushanchaudhari@gritznova.com and hr@sawaiassociates.com in notifyLeaveAdmins_. The code does not automatically discover all Admin or HR recipients. Review this configuration before changing operational recipients.

## Tasks and projects
Tasks use Low, Medium, High and Urgent priorities. Statuses include To do, In progress, Blocked, In review and Completed. The application recognizes the legacy Done status as Completed. Attachment links are validated as HTTP or HTTPS URLs.

Project ownership and task assignment affect management permissions and visibility. Announcement and task notifications are presented through the in-app notification interface.
[[PAGE]]
# Source Structure and Developer Workflow

## Editable source folders
- src/pages contains application screens.
- src/components contains reusable interface components and forms.
- src/hooks contains React hooks, including attendance refresh behavior.
- src/data contains the API client and shared options.
- src/utils contains business logic, formatting and export helpers.
- src/styles contains application CSS.
- src/assets contains bundled images.
- src/i18n contains UI text and preference helpers; its name does not imply that multiple languages are currently enabled.
- public contains static assets.
- apps-script contains Code.gs, Auth.gs, Bcrypt.gs, the manifest and vendor license.
- api contains the Vercel API entry point; server contains shared proxy transport.
- scripts contains build and packaging scripts.
- tests contains automated checks and fixtures.
- docs contains maintained deployment instructions and project documentation.

## Generated and local files
The dist folder contains the generated web build. The deployment folder contains the combined Apps Script Code.gs, packaged Index.html, manifest and bcrypt license copy. These are generated deployment artifacts; source changes belong in src or apps-script.

node_modules contains installed dependencies. .env.local contains local configuration and must not be committed. .env.example documents APPS_SCRIPT_URL without containing a real deployment credential. Temporary outputs are ignored; old outputs and the approved dated backup were removed during cleanup.

## Commands
npm ci installs the dependencies recorded in package-lock.json.

npm run dev starts the local Vite server. Configure APPS_SCRIPT_URL in .env.local and restart after changing it.

npm test runs the full automated suite. npm run test:roles runs dedicated permission checks.

npm run build:web creates dist. npm run build additionally packages the Apps Script deployment files.

## Important entry points
src/App.jsx coordinates application state and actions. src/data/client.js selects the Apps Script bridge or proxy transport. apps-script/Code.gs contains the API and storage rules. apps-script/Auth.gs handles authentication helpers. scripts/create-deployment.mjs combines backend sources, and scripts/package-gas.mjs packages frontend assets.
[[PAGE]]
# Deployment Maintenance and Limitations

## Apps Script deployment
1. Run npm run build locally.
2. Open the private Sheet and its Apps Script project.
3. Replace Code.gs with deployment/Code.gs. Do not keep separate Auth.gs and Bcrypt.gs copies alongside the combined file.
4. Replace the HTML file named Index with deployment/Index.html. Update appsscript.json when the manifest changes.
5. For initial setup, configure ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD in Script Properties. SPREADSHEET_ID can override the configured Sheet ID. Run setup and authorize the manifest permissions. Initial password properties are removed after hashing; existing passwords are preserved.
6. Update the existing web-app deployment through Deploy > Manage deployments > Edit > New version > Deploy. Retain the intended owner and audience configuration.
7. Reload the /exec URL and verify the changed behavior and intended Sheet writes.

The manifest requests spreadsheet and send-mail permissions, uses the V8 runtime and Asia/Kolkata timezone, and declares execution as the deploying user with a public entry point. Keep the underlying Sheet private.

## Optional Vercel hosting
Vercel builds the frontend with npm run build:web and serves dist. The /api/teampulse function forwards requests to Apps Script. Configure APPS_SCRIPT_URL as a server-side environment variable, without a VITE_ prefix. Backend changes still require a new Apps Script deployment. If the /exec URL changes, update local or hosting configuration.

## Maintenance priorities
Forgot-password recovery is not implemented. Make leave email recipients configurable if the temporary recipient is no longer suitable. Load-test Apps Script and Sheets before a large rollout. Retain audit data and plan appropriate backup and session-retention procedures.

Overnight duration calculations have test coverage, but the punch-out API currently searches today's IST records. Review the operational overnight punch-out flow before relying on it for overnight shifts.

A successful local build does not update the live app. Errors such as Only your name can be edited here while saving a joining date indicate that an older backend may still be serving requests.

## Implementation references
README.md; docs/apps-script-deployment.md; docs/vercel-deployment.md; package.json; src/App.jsx; src/pages/Attendance.jsx; src/pages/Settings.jsx; src/data/client.js; apps-script/Code.gs; apps-script/Auth.gs; apps-script/appsscript.json; scripts/create-deployment.mjs; scripts/package-gas.mjs; tests/.


## Daily Work Report (4 November 2026)

The sidebar includes Daily Work Report for all signed-in roles. Employees can add multiple task/project updates per day. The server assigns the authenticated employee and today's IST date; editing preserves that identity and date.

Each entry stores project, today's work, done today, output URLs, issues, pending work, status and EOD remarks. Status options are Not Started, In Progress, Completed and Blocked; Blocked requires an issue description. Output supports up to five http/https links for shared files, screenshots, GitHub commits and deployed sites. Files are linked rather than uploaded into TeamPulse.

Today and Monthly report views use the same entries. Filter by employee and month. Summary cards count distinct projects, completed entries, pending entries and unresolved-blocker entries. Counts represent entries, not deduplicated task IDs. A blocker remains unresolved until its entry is updated out of Blocked and its issue is cleared, or the entry is marked Completed. No separate monthly submission is needed.

Employees see their own reports. Reporting managers also see direct reports. Team Leaders see employees assigned tasks in owned projects or standalone managed tasks. Admin and HR see all non-deleted employees. Server checks enforce scope for snapshots, comments and history. Only the owner edits an entry; authorized reviewers comment on other employees' entries. Owners and reviewers can see those comments.

Every submission/edit appends a full version snapshot with actor and timestamp. Revision checks reject stale edits. In-app and notification-inbox reminders flag missing updates. The module shows today's missing team members and prior missing working days in the selected month. Non-working days, holidays, dates before joining/account creation and approved full-day leave are excluded; WFH still requires reporting. Reminders are in-app, not scheduled email.

Excel exports include Summary, Daily entries and Comments worksheets for the selected authorized rows. PDF / Print opens a print-ready report; choose Print / Save as PDF and the browser's PDF destination. Submitted report content is rendered as text rather than injected HTML.

Storage uses separate dailyReports, reportHistory and reportComments Sheet tabs, created lazily on first write or by owner setup. Existing worklogs are preserved and not automatically imported because they lack the new fields. APIs: reportSnapshot, saveDailyReport, commentDailyReport and dailyReportHistory. Visibility and missing-day counts follow current membership and leave policy.

Deploy both regenerated deployment/Code.gs and deployment/Index.html as a new version of the existing Apps Script deployment, then refresh the app.


### Automatic monthly work Sheets

Daily report submissions, edits and manager comments also rebuild the readable `DWR_YYYY-MM` tab in the same configured spreadsheet. Each employee has a green section heading and daily rows with Date, Output / Link, Issues Faced, Pending Work, Status, EOD Remarks, Project, Today's Work, Done Today, Manager Comments, Last Updated (IST) and Report ID. Multiple entries on one day remain separate rows. The view contains all employees with submitted entries for that month; app filters do not limit the backend Sheet.

The generated tab uses wrapped text, frozen month headers/date column and status colors. Edit reports in TeamPulse, not in this generated view: it is rebuilt from `dailyReports` and `reportComments`. Admin/HR can use **Sync monthly Sheet** for the selected month to backfill existing saved entries or retry a failed sync. Employee names update on the next sync. Historical records for removed employees remain under Former employee.

A tab is overwritten only if its A1 marker exactly matches the generated month title. An unrelated existing tab with the same name is left intact and a warning is returned. Sheet-sync failures do not discard a saved report/comment; the UI warns, and an audit event records the failure. Raw records and version history remain unchanged by presentation rebuilds. Spreadsheet sharing is still controlled by the owner; app roles do not grant direct access to Google Sheets.
