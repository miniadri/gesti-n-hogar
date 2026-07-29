import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DIAGNOSTIC_ADMIN_EMAILS = new Set(["adri.miniadri@gmail.com"]);

type DiagnosticStatus = "ok" | "warning" | "error";

type DiagnosticCheck = {
  key: string;
  label: string;
  status: DiagnosticStatus;
  detail: string;
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

    const environment: DiagnosticCheck[] = [
      check("supabase_url", "Supabase URL", hasEnv("SUPABASE_URL"), "Configurada", "Falta SUPABASE_URL"),
      check(
        "supabase_publishable",
        "Supabase publishable key",
        hasEnv("SUPABASE_PUBLISHABLE_KEY"),
        "Configurada",
        "Falta SUPABASE_PUBLISHABLE_KEY",
      ),
      hasEnv("SUPABASE_SERVICE_ROLE_KEY")
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
