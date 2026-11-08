-- Existing accounts were created by the administrator or by the trusted seed process.
-- Preserve their ability to log in; registrations created after this migration require verification.
UPDATE "User"
SET "emailVerified" = true
WHERE "emailVerified" = false;
