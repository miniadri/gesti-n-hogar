import { createFileRoute } from "@tanstack/react-router";
import { exchangeGoogleOAuthCode } from "@/lib/google-calendar.server";

export const Route = createFileRoute("/api/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          return redirectToSettings(url.origin, `google_error=${encodeURIComponent(error)}`);
        }
        if (!code || !state) {
          return redirectToSettings(url.origin, "google_error=missing_code");
        }

        try {
          const returnTo = await exchangeGoogleOAuthCode(code, state);
          return Response.redirect(`${returnTo}?google=connected`, 302);
        } catch (e: any) {
          console.error("Google OAuth callback failed:", e);
          return redirectToSettings(url.origin, `google_error=${encodeURIComponent(e?.message || "oauth_failed")}`);
        }
      },
    },
  },
});

function redirectToSettings(origin: string, query: string) {
  return Response.redirect(`${origin}/settings/google-calendar?${query}`, 302);
}
