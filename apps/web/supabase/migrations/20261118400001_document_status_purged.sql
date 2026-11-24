-- A purged background-check file keeps its row when the row has review or audit history
-- (migration 20261118400002): the row gets status 'purged' and no storage path. The value is added
-- in its own migration because a value added in a transaction cannot be used in that transaction.

alter type public.document_status add value if not exists 'purged';
