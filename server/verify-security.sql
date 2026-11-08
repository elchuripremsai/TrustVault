SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'DocumentPermission';

SELECT tgname
FROM pg_trigger
WHERE tgrelid = '"AuditLog"'::regclass
AND NOT tgisinternal;
