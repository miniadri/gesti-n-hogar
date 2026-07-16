-- Receipts storage bucket RLS
CREATE POLICY "Allow authenticated uploads to receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Allow authenticated select own receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Allow authenticated delete own receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;
