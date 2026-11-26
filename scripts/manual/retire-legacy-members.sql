-- DO NOT execute automatically or during deployment. Review an exported backup first.
-- SQLite offline/exported copy ONLY; production Durable Object needs a separately reviewed
-- maintenance procedure using its storage SQL API. This file is not a Wrangler/D1 migration.
-- Abort transaction on any guard failure; sqlite3 CLI: .bail on
BEGIN IMMEDIATE;
CREATE TABLE _legacy_member_guard (ok INTEGER CHECK(ok=1));
-- Existing legacy members without a Google identity must not be removed.
-- Run only if legacy tables users and oauth_identities exist; if missing, inspect schema
-- and prepare the matching variant separately (never ignore a failed statement).
INSERT INTO _legacy_member_guard SELECT CASE WHEN EXISTS(
  SELECT 1 FROM users u WHERE NOT EXISTS(SELECT 1 FROM oauth_identities i WHERE i.uid=u.uid)
  OR COALESCE(u.pin_hash,'') <> ''
) THEN 0 ELSE 1 END;
CREATE TABLE IF NOT EXISTS social_users (uid TEXT PRIMARY KEY,nick TEXT NOT NULL,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS social_identities (provider TEXT NOT NULL,subject TEXT NOT NULL,uid TEXT NOT NULL,email TEXT,email_verified INTEGER NOT NULL DEFAULT 0,name TEXT NOT NULL,PRIMARY KEY(provider,subject),UNIQUE(provider,uid));
INSERT INTO _legacy_member_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM social_users) OR EXISTS(SELECT 1 FROM social_identities) THEN 0 ELSE 1 END;
INSERT INTO social_users SELECT uid,nick,created FROM users;
INSERT INTO social_identities SELECT provider,subject,uid,email,CASE WHEN provider='google' AND email<>'' THEN 1 ELSE 0 END,name FROM oauth_identities;
INSERT INTO _legacy_member_guard SELECT CASE WHEN (SELECT COUNT(*) FROM users)=(SELECT COUNT(*) FROM social_users) AND (SELECT COUNT(*) FROM oauth_identities)=(SELECT COUNT(*) FROM social_identities) THEN 1 ELSE 0 END;
DROP TABLE oauth_identities;
DROP TABLE users;
DROP TABLE _legacy_member_guard;
COMMIT;
-- Existing sessions, plans, log, devices keep their UID. Never run against live data without backup and approval.
