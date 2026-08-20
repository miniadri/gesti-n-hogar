import { supabase } from "@/integrations/supabase/client-app";

export async function deleteReceiptUpload(path: string | null | undefined) {
  if (!path) return false;
  const { error } = await supabase.storage.from("receipts").remove([path]);
  if (error) {
    console.warn("Could not delete receipt upload", error);
    return false;
  }
  return true;
}

export async function markReceiptUploadDeleted(receiptId: string | null | undefined, path?: string | null) {
  if (!receiptId) return;
  const payload: Record<string, unknown> = {
    status: "reviewed",
  };
  if (path) payload.image_path = path;
  payload.image_deleted_at = new Date().toISOString();

  const { error } = await supabase.from("receipts").update(payload as any).eq("id", receiptId);
  if (error) {
    // Older databases do not have image_path/image_deleted_at yet. Keep the
    // storage cleanup even when the optional audit columns are unavailable.
    await supabase.from("receipts").update({ status: "reviewed" }).eq("id", receiptId);
  }
}