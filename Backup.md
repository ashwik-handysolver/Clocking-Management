Clockwork Backup Guide
1. What this is
Clockwork keeps all its data in Supabase: a PostgreSQL database plus file storage for screenshots and attachments. To protect against data loss, a backup runs automatically every night and saves a copy to the company’s Google Drive, which is separate from Supabase.

If data is lost, deleted by mistake or damaged, or Supabase has a problem, Clockwork can be rebuilt from these backups.
2. How it works
GitHub Actions starts the backup job automatically every night. Nobody needs to do anything.
The job connects to the Supabase database and makes a full copy of it.
The copy is compressed and encrypted with a passphrase, so nobody can read it without that passphrase.
The encrypted file is uploaded to the Clockwork Backups Shared Drive in Google Drive.
The job then copies any new screenshots, attachments and profile pictures from Supabase Storage to the same Shared Drive.
Old database backups are deleted automatically according to the retention rules below.

Note: The job only reads from Supabase. It never changes anything in the app.
3. What is backed up
Database backup (one encrypted file per backup). Once opened, it contains three files:

File
Contents
data.sql
All app data: users and logins, clients, projects, tasks, subtasks, time entries, screenshot records, attachment records, notifications, holidays, client access and settings
schema.sql
The database structure: tables, security rules, functions and storage permissions
roles.sql
Database roles


Uploaded files (copied as they are, not encrypted):

Folder
Contents
files/snapshots
Screenshots
files/attachments
Pictures, videos and files added to subtask descriptions
files/avatars
Profile pictures


Not included in the backup:

The app’s code. It’s kept in GitHub.
Keys and environment settings. Keep these in a password manager.
Supabase dashboard settings: the Google login setup, allowed sign-in URLs and email templates.
4. Types of backups, frequency and retention
Every database backup is a complete copy of everything up to the moment it was made. You never need to combine files: one file is enough to rebuild everything.

Type
Folder
When it’s made
How long it’s kept
Daily
daily/
Every night
7 days
Weekly
weekly/
Every Sunday night
about 5 weeks
Monthly
monthly/
1st of every month
1 year
Uploaded files
files/
Every night (new files only)
Permanently


Daily is for normal recovery, losing at most one day of work.
Weekly and monthly are for mistakes noticed late, for example data deleted weeks ago that is already missing from all the daily backups.
Deleted backups stay in the Shared Drive’s trash for 30 days before they’re permanently removed.
Files deleted in the app are not removed from the backup.
5. Backup schedule
Set to run at 9:00 pm IST every night.
GitHub can start scheduled jobs late, sometimes by several hours (runs have started around 4 am IST). The backup still completes; only the time changes.
A backup contains everything up to the moment it ran. Work done after that is in the next backup.
The backup can also be run by hand at any time: on GitHub, go to Actions → Nightly backup → Run workflow.
6. Where backups are stored
Location: Google Drive, in the Clockwork Backups Shared Drive(Open Clockwork backups folder).
File names: clockwork-YYYY-MM-DD.tar.gz.gpg, for example clockwork-2026-11-18.tar.gz.gpg.
Size: about 0.3 MB per database backup at present.
Who has access: Shared Drive members. Only trusted people should be members, and only a few should be Managers.
7. How to check that a backup worked
On GitHub: under Actions → Nightly backup, the latest run should show a green tick. A red cross means it failed.
On Google Drive: in daily/, a new file should exist for the latest night, of normal size (0.3 MB or more).

GitHub emails the person who last changed the workflow when a scheduled run fails.
8. How to open a backup
Requirement: Git for Windows installed on the computer. It includes the decryption tool.

Download the backup file from Google Drive (daily/, weekly/ or monthly/). If you download a whole folder, Drive gives you a .zip; that works too.
Double-click Open backup on the Desktop. The same tool is also in the repository at tools/Open backup.cmd.
Choose the downloaded .gpg or .zip file.
Paste the backup passphrase and click Open.
A folder opens containing roles.sql, schema.sql and data.sql.

Notes:

.sql files are plain text and open in Notepad or VS Code, but they’re meant for restoring, not for reading.
Backups made before a passphrase change need the old passphrase.
The opened files are not encrypted. They contain everyone’s emails and all company data. Delete the folder when you’re done and empty the Recycle Bin.
9. How to restore the database
When: Supabase data is lost or damaged, or the project is gone.

Choose a backup: normally the newest file in daily/. Use an older weekly or monthly backup only if the problem began before the daily backups.

Requirement: psql (PostgreSQL command line tools), installed once:

Go to postgresql.org/download/windows and download the installer.
Choose version 17 and select Command Line Tools only.

Steps:

Create a new Supabase project and save its database password. Never restore into the live project.
Open the backup with Open backup.
In the opened folder, click Explorer’s address bar, type powershell and press Enter.
Run this as one line, replacing CONNECTION_STRING with the new project’s Session pooler connection string (from the Connect button):

& "C:\Program Files\PostgreSQL\17\bin\psql.exe" --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command "SET session_replication_role = replica" --file data.sql --dbname "CONNECTION_STRING"Either everything loads or nothing does. If an ERROR appears, nothing was changed.

In the new project, create the storage buckets snapshots, attachments and avatars, and copy the files back from the Drive’s files/ folder.
Redo the Supabase settings:
Authentication → Providers → Google (same Client ID and secret)
Authentication → URL Configuration: add https://clocking-management.vercel.app and http://localhost:5173
Email templates, from supabase/email-templates in the repository
Point the app at the new project: update the Supabase URL and anon key in Vercel → Settings → Environment Variables, redeploy, and update .env.local.
Update the backup secrets in GitHub (SUPABASE_DB_URL and the SUPABASE_S3_* secrets).

Recommended: practise a restore into a free test project once, then delete the test project.
10. Setup details (for reference)
GitHub secrets
(Repository → Settings → Secrets and variables → Actions)

Secret
What it is
SUPABASE_DB_URL
Database connection string (Session pooler) used to copy the database
BACKUP_PASSPHRASE
Passphrase that encrypts backups. Also saved in a password manager
GDRIVE_SERVICE_ACCOUNT_JSON
Key for the Google robot account that uploads to Drive
GDRIVE_FOLDER_ID
ID of the Clockwork Backups Shared Drive
SUPABASE_S3_ENDPOINT
Supabase Storage address, for copying files
SUPABASE_S3_REGION
Supabase Storage region
SUPABASE_S3_ACCESS_KEY_ID
Supabase Storage access key
SUPABASE_S3_SECRET_ACCESS_KEY
Supabase Storage secret key


Other parts:

Backup job: .github/workflows/backup.yml in the repository.
Google robot account: a service account in the Google Cloud project clockwork-backups, added to the Shared Drive as Content manager.
Encryption: AES-256 with GPG, using the passphrase.
11. Troubleshooting
Problem
Likely cause
Fix
Red cross: "Missing secrets"
A GitHub secret was deleted or renamed
Add it again with the exact name from section 10
Fails at "Dump the database" with a login or password error
The database password was changed in Supabase
Update SUPABASE_DB_URL in GitHub with the new password
Fails at "Dump the database" with a connection error
The direct connection string was used instead of the Session pooler
Use the Session pooler string from Supabase → Connect
Fails at the Supabase CLI setup step
Version lookup problem or a new CLI release
Re-run the job. If it keeps failing, update the pinned version in backup.yml
Fails at "Upload to Google Drive"
The robot’s key was deleted, or the robot was removed from the Shared Drive
Check the robot is a Content manager on the Shared Drive. Create a new JSON key and update GDRIVE_SERVICE_ACCOUNT_JSON
Warning: "Storage secrets not set"
The SUPABASE_S3_* secrets are missing
Add the 4 storage secrets. The database backup still runs
Fails at copying files
Supabase storage key deleted or S3 access turned off
In Supabase → Storage → S3 Connection, turn S3 on, create a new key and update the secrets
No run at all last night
GitHub delayed or skipped the scheduled run
Check later. Run it by hand from Actions if needed. GitHub also pauses schedules in repositories with no activity for 60 days, so re-enable it from Actions if that happens
"Wrong passphrase" or "bad key" when opening
Wrong passphrase, or the backup predates a passphrase change
Use the passphrase that was active when that backup was made
"gpg was not found" when opening
Git for Windows isn’t installed
Install Git for Windows or Gpg4win
Drive running out of space
The files/ folder grows over time
Check its size occasionally and remove very old screenshots if needed


General steps when a backup fails:

Open GitHub → Actions → Nightly backup and click the failed run.
Click the step with the red cross and read the error message.
Match it to the table above.
After fixing it, click Run workflow to make a fresh backup for that day.
12. Security rules
Never share the passphrase, connection string or any key in chats or emails.
Keep the passphrase in a password manager. Without it, backups can’t be opened.
After a passphrase change, keep the old one until older backups have been deleted.
Delete downloaded and opened backups after use.
Keep the GitHub repository private, and limit Shared Drive membership to trusted people.
If any key is exposed, delete it at its source (Supabase or Google Cloud), create a new one and update the GitHub secret.


