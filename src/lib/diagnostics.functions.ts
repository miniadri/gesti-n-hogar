import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DIAGNOSTIC_ADMIN_EMAILS = new Set(["adri.miniadri@gmail.com"]);

type DiagnosticStatus = "ok" | "warning" | "error";

type DiagnosticCheck = {
  key: string;
  label: string;
  status: DiagnosticStatus;
  detail: string;
};

type DiagnosticTestResult = {
  key: string;
  status: DiagnosticStatus;
  title: string;
  detail: string;
  checkedAt: string;
};

function hasEnv(name: string) {
  return Boolean(process.env[name]);
}

function check(key: string, label: string, ok: boolean, detailOk: string, detailMissing: string): DiagnosticCheck {
  return {
    key,
    label,
    status: ok ? "ok" : "error",
    detail: ok ? detailOk : detailMissing,
  };
}

function warningCheck(key: string, label: string, detail: string): DiagnosticCheck {
  return {
    key,
    label,
    status: "warning",
    detail,
  };
}

function currentUserEmail(context: any): string {
  return String(context?.claims?.email ?? "").toLowerCase();
}

function assertDiagnosticAdmin(context: any) {
  const email = currentUserEmail(context);
  if (!DIAGNOSTIC_ADMIN_EMAILS.has(email)) {
    throw new Error("No autorizado");
  }
}

async function maybeCount(query: PromiseLike<{ count: number | null; error: any }>) {
  const { count, error } = await query;
  if (error) return null;
  return count ?? 0;
}

async function maybeLatest<T>(query: PromiseLike<{ data: T | null; error: any }>): Promise<T | null> {
  const { data, error } = await query;
  if (error) return null;
  return data ?? null;
}

async function maybeGoogleCalendarConnection(userId: string) {
  try {
    const { hasConnection } = await import("@/server/appUserConnections.server");
    return await hasConnection(userId, "google_calendar");
  } catch (err) {
    console.warn("Google Calendar diagnostic unavailable", err);
    return null;
  }
}

function testResult(
  key: string,
  status: DiagnosticStatus,
  title: string,
  detail: string,
): DiagnosticTestResult {
  return {
    key,
    status,
    title,
    detail,
    checkedAt: new Date().toISOString(),
  };
}

async function requireHouseholdId(supabase: any): Promise<string> {
  const householdId = (await supabase.rpc("current_household")).data as string | null;
  if (!householdId) throw new Error("No household");
  return householdId;
}

export const getDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertDiagnosticAdmin(context);

    const householdId = (await context.supabase.rpc("current_household")).data as string | null;
    if (!householdId) throw new Error("No household");

    const { data: householdUserRows } = await context.supabase
      .from("household_members")
      .select("user_id")
      .eq("household_id", householdId)
      .not("user_id", "is", null);
    const householdUserIds = (householdUserRows ?? []).map((row: any) => row.user_id).filter(Boolean);

    const [
      householdMembers,
      telegramProfiles,
      pushSubscriptions,
      emergencyContacts,
      latestSos,
      pendingMedicationIntakes,
      latestMedicationIntake,
      googleConnection,
      homeAssistantConnection,
    ] = await Promise.all([
      maybeCount(
        context.supabase
          .from("household_members")
          .select("id", { count: "exact", head: true })
          .eq("household_id", householdId),
      ),
      maybeCount(
        context.supabase
          .from("telegram_profiles")
          .select("user_id", { count: "exact", head: true })
          .in("user_id", householdUserIds.length ? householdUserIds : ["00000000-0000-0000-0000-000000000000"]),
      ),
      maybeCount(
        context.supabase
          .from("push_subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", context.userId),
      ),
      maybeCount(
        context.supabase
          .from("emergency_contacts")
          .select("id", { count: "exact", head: true })
          .eq("household_id", householdId),
      ),
      maybeLatest<any>(
        context.supabase
          .from("sos_events")
          .select("created_at, latitude, longitude, location_accuracy")
          .eq("household_id", householdId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
      maybeCount(
        context.supabase
          .from("medication_intakes")
          .select("id, medications!inner(household_id)", { count: "exact", head: true })
          .eq("medications.household_id", householdId)
          .eq("status", "pending"),
      ),
      maybeLatest<any>(
        context.supabase
          .from("medication_intakes")
          .select("created_at, scheduled_for, status, medications!inner(household_id)")
          .eq("medications.household_id", householdId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
      maybeGoogleCalendarConnection(context.userId),
      maybeLatest<any>(
        context.supabase
          .from("home_assistant_connections")
          .select("status, last_synced_at, last_error, updated_at")
          .eq("household_id", householdId)
          .maybeSingle(),
      ),
    ]);

    const telegramEnvConfigured = hasEnv("LOVABLE_API_KEY") && hasEnv("TELEGRAM_API_KEY");
    const pushEnvConfigured = hasEnv("VAPID_PUBLIC_KEY") && hasEnv("VAPID_PRIVATE_KEY");
    const googleEnvConfigured = hasEnv("GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY");
    const homeAssistantConfigured = Boolean(homeAssistantConnection);

    const supabaseUrlConfigured = hasEnv("SUPABASE_URL") || hasEnv("VITE_SUPABASE_URL");
    const supabasePublishableConfigured =
      hasEnv("SUPABASE_PUBLISHABLE_KEY") ||
      hasEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
      hasEnv("VITE_SUPABASE_ANON_KEY");
    const supabaseServiceConfigured =
      hasEnv("SUPABASE_SERVICE_ROLE_KEY") || hasEnv("APP_SUPABASE_SERVICE_ROLE_KEY");

    const environment: DiagnosticCheck[] = [
      check(
        "supabase_url",
        "Supabase URL",
        supabaseUrlConfigured,
        "Configurada",
        "Falta SUPABASE_URL o VITE_SUPABASE_URL",
      ),
      check(
        "supabase_publishable",
        "Supabase publishable key",
        supabasePublishableConfigured,
        "Configurada",
        "Falta SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PUBLISHABLE_KEY o VITE_SUPABASE_ANON_KEY",
      ),
      supabaseServiceConfigured
        ? check("supabase_service", "Supabase service role", true, "Configurada", "")
        : warningCheck(
            "supabase_service",
            "Supabase service role",
            "No visible para diagnóstico; limita comprobaciones admin",
          ),
      telegramEnvConfigured
        ? check("telegram", "Telegram", true, "Gateway y bot configurados", "")
        : (telegramProfiles ?? 0) > 0
          ? warningCheck("telegram", "Telegram", "Hay usuarios vinculados; gateway no verificable desde diagnóstico")
          : check("telegram", "Telegram", false, "", "Falta configuración o no hay usuarios vinculados"),
      pushEnvConfigured
        ? check("push", "Push web", true, "VAPID configurado", "")
        : (pushSubscriptions ?? 0) > 0
          ? warningCheck("push", "Push web", "Hay suscripción push; VAPID no verificable desde diagnóstico")
          : check("push", "Push web", false, "", "Falta VAPID o no hay suscripción push activa"),
      googleEnvConfigured
        ? check("google_calendar", "Google Calendar", true, "Conector configurado", "")
        : googleConnection === true
          ? check("google_calendar", "Google Calendar", true, "Conexión detectada", "")
          : warningCheck("google_calendar", "Google Calendar", "No verificable desde diagnóstico; prueba desde Calendario"),
      hasEnv("PUBLIC_APP_URL")
        ? check("app_url", "URL pública", true, "Configurada", "")
        : warningCheck("app_url", "URL pública", "No visible; Lovable puede estar usando una URL propia"),
      homeAssistantConfigured
        ? check("ha_secret", "Home Assistant", true, "Conexión guardada en el hogar", "")
        : check("ha_secret", "Home Assistant", hasEnv("HA_TOKEN_SECRET"), "Cifrado de token configurado", "No configurado"),
      hasEnv("CRON_BEARER")
        ? check("cron", "Cron interno", true, "Secreto configurado", "")
        : warningCheck("cron", "Cron interno", "No verificable desde diagnóstico; revisar solo si fallan tareas automáticas"),
    ];

    return {
      generatedAt: new Date().toISOString(),
      environment,
      summary: {
        householdMembers,
        telegramLinkedUsers: telegramProfiles,
        currentUserPushSubscriptions: pushSubscriptions,
        emergencyContacts,
      },
      integrations: {
        googleCalendar: {
          connected: googleConnection === true,
          available: googleConnection !== null,
        },
        homeAssistant: homeAssistantConnection
          ? {
              configured: true,
              status: homeAssistantConnection.status ?? "unknown",
              lastSyncedAt: homeAssistantConnection.last_synced_at ?? null,
              hasLastError: Boolean(homeAssistantConnection.last_error),
              updatedAt: homeAssistantConnection.updated_at ?? null,
            }
          : {
              configured: false,
              status: "not_configured",
              lastSyncedAt: null,
              hasLastError: false,
              updatedAt: null,
            },
      },
      activity: {
        latestSos: latestSos
          ? {
              createdAt: latestSos.created_at,
              hasLocation: latestSos.latitude != null && latestSos.longitude != null,
              locationAccuracy: latestSos.location_accuracy ?? null,
            }
          : null,
        pendingMedicationIntakes,
        latestMedicationIntake: latestMedicationIntake
          ? {
              createdAt: latestMedicationIntake.created_at,
              scheduledFor: latestMedicationIntake.scheduled_for,
              status: latestMedicationIntake.status,
            }
          : null,
      },
    };
  });

const DiagnosticTestInput = z.object({
  test: z.enum(["telegram", "push", "google_calendar", "home_assistant", "supabase_admin", "cron", "sos_reminder"]),
});

export const runDiagnosticTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DiagnosticTestInput.parse(input))
  .handler(async ({ data, context }): Promise<DiagnosticTestResult> => {
    assertDiagnosticAdmin(context);

    const householdId = await requireHouseholdId(context.supabase);

    if (data.test === "telegram") {
      const { sendTelegramToUsers } = await import("@/lib/notify.server");
      const sent = await sendTelegramToUsers(
        context.supabase,
        [context.userId],
        [
          "Prueba de Telegram desde Diagnóstico",
          "Si recibes este mensaje, el canal Telegram está funcionando.",
          `Hora: ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}`,
        ].join("\n"),
        undefined,
        null,
      );

      return testResult(
        "telegram",
        sent > 0 ? "ok" : "warning",
        "Telegram",
        sent > 0
          ? `Envío confirmado a ${sent} chat${sent === 1 ? "" : "s"}.`
          : "No se pudo confirmar el envío. Revisa incidente de Lovable, conector o vinculación Telegram.",
      );
    }

    if (data.test === "push") {
      const { sendPushToUsers } = await import("@/lib/notify.server");
      const sent = await sendPushToUsers(context.supabase, [context.userId], {
        title: "Prueba de Diagnóstico",
        body: "Las notificaciones push están funcionando en este dispositivo.",
        url: "/settings/diagnostics",
      });

      return testResult(
        "push",
        sent ? "ok" : "warning",
        "Push web",
        sent
          ? "Prueba push enviada al usuario actual."
          : "No se confirmó envío push. Revisa permiso del navegador, suscripción o VAPID.",
      );
    }

    if (data.test === "google_calendar") {
      if (!hasEnv("GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY")) {
        return testResult(
          "google_calendar",
          "warning",
          "Google Calendar",
          "El conector de Google Calendar no está visible en este runtime.",
        );
      }

      const connected = await maybeGoogleCalendarConnection(context.userId);
      if (connected !== true) {
        return testResult(
          "google_calendar",
          "warning",
          "Google Calendar",
          connected === false ? "Usuario no conectado a Google Calendar." : "No se pudo verificar la conexión guardada.",
        );
      }

      try {
        const { listPrimaryEvents } = await import("@/lib/google-calendar.server");
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const events = await listPrimaryEvents(context.userId, {
          timeMinISO: now.toISOString(),
          timeMaxISO: tomorrow.toISOString(),
        });
        return testResult(
          "google_calendar",
          "ok",
          "Google Calendar",
          `Lectura correcta. Eventos próximos encontrados: ${events.length}.`,
        );
      } catch (err: any) {
        return testResult(
          "google_calendar",
          "warning",
          "Google Calendar",
          `Conexión guardada, pero la lectura falló: ${err?.message ?? "error desconocido"}`,
        );
      }
    }

    if (data.test === "home_assistant") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row, error } = await supabaseAdmin
        .from("home_assistant_connections")
        .select("base_url, token_ciphertext")
        .eq("household_id", householdId)
        .maybeSingle();
      if (error) throw error;
      if (!row) {
        return testResult("home_assistant", "warning", "Home Assistant", "No hay conexión guardada para el hogar.");
      }

      try {
        const { decryptToken } = await import("@/lib/ha-crypto.server");
        const { haPing } = await import("@/lib/home-assistant.server");
        await haPing(row.base_url, decryptToken(row.token_ciphertext));
        return testResult("home_assistant", "ok", "Home Assistant", "Ping real completado correctamente.");
      } catch (err: any) {
        return testResult(
          "home_assistant",
          "warning",
          "Home Assistant",
          `No se pudo completar el ping: ${err?.message ?? "error desconocido"}`,
        );
      }
    }

    if (data.test === "supabase_admin") {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("households")
          .select("id", { count: "exact", head: true })
          .eq("id", householdId);
        if (error) throw error;
        return testResult("supabase_admin", "ok", "Supabase admin", "Service role disponible en servidor.");
      } catch (err: any) {
        return testResult(
          "supabase_admin",
          "warning",
          "Supabase admin",
          `No verificable desde este runtime: ${err?.message ?? "error desconocido"}`,
        );
      }
    }

    if (data.test === "sos_reminder") {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { dispatchSosNotifications } = await import("@/lib/notify.server");

        const { data: event, error } = await supabaseAdmin
          .from("sos_events")
          .select(
            "id, household_id, triggered_by_name, latitude, longitude, location_accuracy, note, created_at, acknowledged_at, last_reminder_sent_at, reminder_count, is_test",
          )
          .eq("household_id", householdId)
          .is("acknowledged_at", null)
          .eq("is_test", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!event) {
          return testResult(
            "sos_reminder",
            "warning",
            "Recordatorio SOS",
            "No hay ningún SOS real pendiente sin acuse para reenviar.",
          );
        }

        const [{ count: acknowledged }, { count: pending }] = await Promise.all([
          supabaseAdmin
            .from("sos_acknowledgements")
            .select("id", { count: "exact", head: true })
            .eq("sos_event_id", event.id)
            .not("acknowledged_at", "is", null),
          supabaseAdmin
            .from("sos_acknowledgements")
            .select("id", { count: "exact", head: true })
            .eq("sos_event_id", event.id)
            .is("acknowledged_at", null),
        ]);

        if ((acknowledged ?? 0) > 0) {
          await supabaseAdmin
            .from("sos_events")
            .update({ acknowledged_at: new Date().toISOString() })
            .eq("id", event.id)
            .is("acknowledged_at", null);
          return testResult(
            "sos_reminder",
            "warning",
            "Recordatorio SOS",
            "El SOS ya tiene al menos un acuse; por diseño no se reenvían más recordatorios.",
          );
        }

        if (!pending) {
          return testResult(
            "sos_reminder",
            "warning",
            "Recordatorio SOS",
            "El SOS pendiente no tiene destinatarios sin acuse. Revisa contactos SOS.",
          );
        }

        const reminderNumber = (event.reminder_count ?? 0) + 1;
        const status = await dispatchSosNotifications(supabaseAdmin, event, reminderNumber);
        await supabaseAdmin
          .from("sos_events")
          .update({
            last_reminder_sent_at: new Date().toISOString(),
            reminder_count: reminderNumber,
          })
          .eq("id", event.id);

        return testResult(
          "sos_reminder",
          status.ok ? "ok" : "warning",
          "Recordatorio SOS",
          status.ok
            ? `Recordatorio manual enviado. Telegram: ${status.telegramSent}. Push: ${status.pushSent ? "sí" : "no"}. Pendientes: ${pending}.`
            : `Se encontró SOS pendiente, pero no se confirmó envío. Motivo: ${status.reason ?? "desconocido"}. Pendientes: ${pending}.`,
        );
      } catch (err: any) {
        return testResult(
          "sos_reminder",
          "error",
          "Recordatorio SOS",
          `No se pudo ejecutar el recordatorio manual: ${err?.message ?? "error desconocido"}`,
        );
      }
    }

    const cronConfigured = hasEnv("CRON_BEARER");
    const latestSosReminder = await maybeLatest<any>(
      context.supabase
        .from("sos_events")
        .select("last_reminder_sent_at, reminder_count")
        .eq("household_id", householdId)
        .not("last_reminder_sent_at", "is", null)
        .order("last_reminder_sent_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );

    return testResult(
      "cron",
      cronConfigured ? "ok" : "warning",
      "Cron interno",
      cronConfigured
        ? latestSosReminder
          ? `CRON_BEARER visible. Último recordatorio SOS: ${new Date(latestSosReminder.last_reminder_sent_at).toLocaleString("es-ES")}.`
          : "CRON_BEARER visible. Sin evidencia reciente de recordatorios SOS."
        : "CRON_BEARER no está visible en este runtime.",
    );
  });
