-- Supports keyset paging of genuine uploaded documents without scanning the millions of
-- POD-AWB-BACKFILL synchronization artifacts. CONCURRENTLY avoids blocking normal writes.
-- This file intentionally has no BEGIN/COMMIT because PostgreSQL forbids CONCURRENTLY in a txn.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_library_page_id
  ON public.documents (id DESC)
  WHERE document_no NOT LIKE 'POD-AWB-BACKFILL-%';
