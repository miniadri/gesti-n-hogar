CREATE POLICY "loyalty_cards_read_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'loyalty-cards' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "loyalty_cards_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'loyalty-cards' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "loyalty_cards_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'loyalty-cards' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "loyalty_cards_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'loyalty-cards' AND auth.uid()::text = (storage.foldername(name))[1]);