import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { suggestLocation } from "./inventory-locations";
import { logHouseholdActivity } from "./activity.functions";

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}


const InventoryInput = z.object({
  name: z.string().min(1).max(200),
  category: z.string().optional(),
  quantity: z.number().nonnegative().default(1),
  unit: z.string().optional(),
  min_stock: z.number().nonnegative().default(0),
  location: z.string().optional(),
  expiry_date: z.string().date().optional(),
  last_price: z.number().nonnegative().optional(),
  ean: z.string().min(6).max(32).optional(),
  mercadona_id: z.string().max(32).optional(),
  image_url: z.string().url().optional(),
});

const UpdateInventoryInput = InventoryInput.partial().extend({ id: z.string().uuid() });
const DeleteInventoryInput = z.object({ id: z.string().uuid() });

export const listInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data, error } = await context.supabase
      .from("inventory_items")
      .select("*")
      .eq("household_id", householdId)
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const createInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InventoryInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    // Merge into an existing row when possible so scans don't create duplicates:
    //  - same EAN, OR
    //  - same name (case-insensitive) and no EAN yet on the existing row
    let existing: any = null;
    if (data.ean) {
      const { data: byEan } = await context.supabase
        .from("inventory_items")
        .select("*")
        .eq("household_id", householdId)
        .eq("ean", data.ean)
        .limit(1)
        .maybeSingle();
      existing = byEan;
    }
    if (!existing) {
      const { data: byName } = await context.supabase
        .from("inventory_items")
        .select("*")
        .eq("household_id", householdId)
        .ilike("name", data.name)
        .is("ean", null)
        .limit(1)
        .maybeSingle();
      existing = byName;
    }

    if (existing) {
      const merged = {
        name: data.name, // trust the user's latest name
        quantity: Number(existing.quantity ?? 0) + Number(data.quantity ?? 1),
        ean: data.ean ?? existing.ean ?? null,
        category: data.category ?? existing.category,
        unit: data.unit ?? existing.unit,
        location: data.location ?? existing.location,
        expiry_date: data.expiry_date ?? existing.expiry_date,
        last_price: data.last_price ?? existing.last_price,
        min_stock: data.min_stock ?? existing.min_stock,
        mercadona_id: data.mercadona_id ?? existing.mercadona_id,
        image_url: data.image_url ?? existing.image_url,
      };
      const { data: updated, error } = await context.supabase
        .from("inventory_items")
        .update(merged)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      await logHouseholdActivity(context.supabase, householdId, context.userId, {
        domain: "inventory",
        action: "updated",
        title: `${updated.name} actualizado en inventario`,
        details: `Cantidad: ${existing.quantity ?? 0} -> ${updated.quantity ?? 0}`,
        entityType: "inventory_item",
        entityId: updated.id,
        metadata: { source: "create_or_merge", previous_quantity: existing.quantity, quantity: updated.quantity },
      });
      return updated;
    }

    const { data: item, error } = await context.supabase
      .from("inventory_items")
      .insert({ ...data, household_id: householdId })
      .select()
      .single();
    if (error) throw error;
    await logHouseholdActivity(context.supabase, householdId, context.userId, {
      domain: "inventory",
      action: "created",
      title: `${item.name} añadido al inventario`,
      details: `${item.quantity ?? 0} ${item.unit || "ud."}${item.location ? ` · ${item.location}` : ""}`,
      entityType: "inventory_item",
      entityId: item.id,
      metadata: { quantity: item.quantity, unit: item.unit, location: item.location, category: item.category },
    });
    return item;
  });

export const updateInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateInventoryInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const { data: before } = await context.supabase
      .from("inventory_items")
      .select("*")
      .eq("household_id", householdId)
      .eq("id", id)
      .maybeSingle();
    const { data: item, error } = await context.supabase
      .from("inventory_items")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    await logHouseholdActivity(context.supabase, householdId, context.userId, {
      domain: "inventory",
      action: "updated",
      title: `${item.name} actualizado`,
      details: summarizeInventoryChange(before, item),
      entityType: "inventory_item",
      entityId: item.id,
      metadata: { before, after: item, changed: Object.keys(rest) },
    });
    return item;
  });

export const deleteInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteInventoryInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const { data: item } = await context.supabase
      .from("inventory_items")
      .select("id, name, quantity, unit, location")
      .eq("household_id", householdId)
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase.from("inventory_items").delete().eq("id", data.id);
    if (error) throw error;
    if (item) {
      await logHouseholdActivity(context.supabase, householdId, context.userId, {
        domain: "inventory",
        action: "deleted",
        title: `${item.name} eliminado del inventario`,
        details: `${item.quantity ?? 0} ${item.unit || "ud."}${item.location ? ` · ${item.location}` : ""}`,
        entityType: "inventory_item",
        entityId: item.id,
        metadata: item,
      });
    }
    return { ok: true };
  });

const ImportReceiptInput = z.object({ receiptId: z.string().uuid() });

export const importReceiptToInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ImportReceiptInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: receipt, error: rErr } = await context.supabase
      .from("receipts")
      .select("id, receipt_date, household_id")
      .eq("id", data.receiptId)
      .single();
    if (rErr) throw rErr;

    const { data: items, error: iErr } = await context.supabase
      .from("receipt_items")
      .select("name, quantity, unit_price, total_price, category")
      .eq("receipt_id", data.receiptId);
    if (iErr) throw iErr;

    const { data: inv } = await context.supabase
      .from("inventory_items")
      .select("id, name, quantity, updated_at, location, last_price")
      .eq("household_id", householdId);

    const receiptDate = receipt.receipt_date ? new Date(receipt.receipt_date) : new Date();
    // Compare by day (YYYY-MM-DD)
    const receiptDay = receiptDate.toISOString().slice(0, 10);

    let added = 0;
    let skipped = 0;
    const invByName = new Map<string, any>();
    for (const it of inv ?? []) invByName.set(normalizeName(it.name), it);

    for (const it of items ?? []) {
      const key = normalizeName(it.name);
      if (!key) continue;
      const existing = invByName.get(key);
      if (existing) {
        const updatedDay = String(existing.updated_at ?? "").slice(0, 10);
        if (updatedDay === receiptDay) {
          // Already added today (likely from shopping list) — skip to avoid duplicate
          // but update last_price if we have it
          if (it.unit_price != null && existing.last_price == null) {
            await context.supabase
              .from("inventory_items")
              .update({ last_price: it.unit_price })
              .eq("id", existing.id);
          }
          skipped++;
          continue;
        }
        // Older entry: increment quantity and refresh price
        await context.supabase
          .from("inventory_items")
          .update({
            quantity: Number(existing.quantity ?? 0) + Number(it.quantity ?? 1),
            last_price: it.unit_price ?? existing.last_price,
          })
          .eq("id", existing.id);
        await logHouseholdActivity(context.supabase, householdId, context.userId, {
          domain: "inventory",
          action: "imported",
          title: `${it.name} importado desde ticket`,
          details: `Cantidad añadida: ${it.quantity ?? 1}`,
          entityType: "inventory_item",
          entityId: existing.id,
          metadata: { receipt_id: data.receiptId, quantity: it.quantity, unit_price: it.unit_price },
        });
        added++;
        continue;
      }

      const { data: inserted } = await context.supabase.from("inventory_items").insert({
        household_id: householdId,
        name: it.name,
        category: it.category ?? null,
        quantity: it.quantity ?? 1,
        location: suggestLocation(it.category),
        last_price: it.unit_price ?? null,
      }).select("id").single();
      await logHouseholdActivity(context.supabase, householdId, context.userId, {
        domain: "inventory",
        action: "imported",
        title: `${it.name} añadido desde ticket`,
        details: `Cantidad: ${it.quantity ?? 1}`,
        entityType: "inventory_item",
        entityId: inserted?.id ?? null,
        metadata: { receipt_id: data.receiptId, quantity: it.quantity, unit_price: it.unit_price },
      });
      added++;
    }

    return { added, skipped, total: items?.length ?? 0 };
  });


const RestoreInventoryInput = z.object({ row: z.record(z.string(), z.any()) });

export const restoreInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RestoreInventoryInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const payload: Record<string, any> = { ...data.row, household_id: householdId };
    delete payload.updated_at;
    const { data: row, error } = await context.supabase
      .from("inventory_items")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;
    await logHouseholdActivity(context.supabase, householdId, context.userId, {
      domain: "inventory",
      action: "restored",
      title: `${row.name} restaurado en inventario`,
      details: `${row.quantity ?? 0} ${row.unit || "ud."}`,
      entityType: "inventory_item",
      entityId: row.id,
      metadata: { restored_from_undo: true },
    });
    return row;
  });

function summarizeInventoryChange(before: any, after: any) {
  if (!before) return "Datos actualizados";
  const changes: string[] = [];
  if (Number(before.quantity ?? 0) !== Number(after.quantity ?? 0)) {
    changes.push(`cantidad ${before.quantity ?? 0} -> ${after.quantity ?? 0}`);
  }
  if ((before.location ?? "") !== (after.location ?? "")) {
    changes.push(`ubicación ${before.location || "sin ubicación"} -> ${after.location || "sin ubicación"}`);
  }
  if (Number(before.min_stock ?? 0) !== Number(after.min_stock ?? 0)) {
    changes.push(`mínimo ${before.min_stock ?? 0} -> ${after.min_stock ?? 0}`);
  }
  if ((before.expiry_date ?? "") !== (after.expiry_date ?? "")) {
    changes.push(`caducidad ${before.expiry_date || "sin fecha"} -> ${after.expiry_date || "sin fecha"}`);
  }
  return changes.length > 0 ? changes.join(" · ") : "Datos actualizados";
}
