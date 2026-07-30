import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  ListTodo,
  Calendar,
  ShoppingCart,
  Wallet,
  Menu,
  Bell,
  Settings,
  LogOut,
  Users,
  ChefHat,
  Package,
  Zap,
  Pill,
  CreditCard,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useNavPreferences, type NavKey } from "@/lib/nav-preferences";
import { SosAckBanner } from "@/components/SosAckBanner";


type NavEntry = { key: NavKey; to: string; label: string; icon: React.ComponentType<{ className?: string }> };

function useNavCatalog(): Record<NavKey, NavEntry> {
  const { t } = useTranslation();
  return {
    dashboard: { key: "dashboard", to: "/dashboard", label: t("nav.dashboard"), icon: Home },
    tasks: { key: "tasks", to: "/tasks", label: t("nav.tasks"), icon: ListTodo },
    calendar: { key: "calendar", to: "/calendar", label: t("nav.calendar"), icon: Calendar },
    shopping: { key: "shopping", to: "/shopping", label: t("nav.shoppingList"), icon: ShoppingCart },
    inventory: { key: "inventory", to: "/inventory", label: t("nav.inventory"), icon: Package },
    recipes: { key: "recipes", to: "/recipes", label: t("nav.recipes"), icon: ChefHat },
    finances: { key: "finances", to: "/finances", label: t("nav.finances"), icon: Wallet },
    devices: { key: "devices", to: "/devices", label: t("nav.devices"), icon: Zap },
    medications: { key: "medications", to: "/medications", label: t("nav.medications"), icon: Pill },
    loyalty: { key: "loyalty", to: "/loyalty", label: t("nav.loyalty"), icon: CreditCard },
  };
}

function useVisibleNav(): NavEntry[] {
  const catalog = useNavCatalog();
  const { prefs } = useNavPreferences();
  const hidden = new Set(prefs.hidden);
  return prefs.order.filter((k) => !hidden.has(k)).map((k) => catalog[k]);
}

function useBottomNav(): NavEntry[] {
  // Show the first 5 visible sidebar items in the mobile bottom bar
  return useVisibleNav().slice(0, 5);
}

function useSidebarNav(): NavEntry[] {
  return useVisibleNav();
}


interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  userName?: string;
  notificationCount?: number;
  realtimeStatus?: "connecting" | "live" | "error";
}

export function AppShell({ children, title, userName, notificationCount = 0, realtimeStatus }: AppShellProps) {
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar
        title={title}
        userName={userName}
        notificationCount={notificationCount}
        realtimeStatus={realtimeStatus}
        onMenuOpen={() => setMobileMenuOpen(true)}
      />

      <div className="flex flex-1">
        {!isMobile && <DesktopSidebar />}

        <main className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6 md:pb-6 md:pt-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SosAckBanner />
            {children}
          </div>

        </main>
      </div>

      {isMobile && <MobileBottomNav />}

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[280px] p-0">
          <MobileSidebar onClose={() => setMobileMenuOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TopBar({
  title,
  userName,
  notificationCount,
  realtimeStatus,
  onMenuOpen,
}: {
  title?: string;
  userName?: string;
  notificationCount: number;
  realtimeStatus?: "connecting" | "live" | "error";
  onMenuOpen: () => void;
}) {
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/80 px-4 py-3 backdrop-blur-md md:px-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {isMobile && (
            <Button variant="ghost" size="icon" className="shrink-0" onClick={onMenuOpen}>
              <Menu className="h-5 w-5" />
              <span className="sr-only">{t("common.menu")}</span>
            </Button>
          )}
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Home className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold leading-tight md:text-xl">HomeSync</h1>
              {title && <p className="truncate text-xs text-muted-foreground md:text-sm">{title}</p>}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {realtimeStatus && (
            <span
              title={
                realtimeStatus === "live"
                  ? t("realtime.liveTitle")
                  : realtimeStatus === "connecting"
                    ? t("realtime.connectingTitle")
                    : t("realtime.errorTitle")
              }
              className="hidden items-center gap-1.5 rounded-full border border-border bg-background/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  realtimeStatus === "live" && "bg-emerald-500 animate-pulse",
                  realtimeStatus === "connecting" && "bg-amber-500",
                  realtimeStatus === "error" && "bg-muted-foreground/50",
                )}
              />
              {realtimeStatus === "live"
                ? t("realtime.live")
                : realtimeStatus === "connecting"
                  ? t("realtime.connecting")
                  : t("realtime.offline")}
            </span>
          )}
          <Link to="/settings/notifications">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {notificationCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px]"
                >
                  {notificationCount > 99 ? "99+" : notificationCount}
                </Badge>
              )}
              <span className="sr-only">{t("common.notifications")}</span>
            </Button>
          </Link>

        </div>
      </div>
    </header>
  );
}

function DesktopSidebar() {
  const { t } = useTranslation();
  const sidebarNavItems = useSidebarNav();
  return (
    <aside className="sticky top-[61px] hidden h-[calc(100vh-61px)] w-64 shrink-0 border-r border-border bg-card lg:block">
      <div className="flex h-full flex-col p-4">
        <nav className="flex-1 space-y-1">
          {sidebarNavItems.map((item) => (
            <NavItem key={item.to} item={item} />
          ))}
        </nav>
        <div className="border-t border-border pt-4">
          <NavItem item={{ to: "/settings", label: t("nav.settings"), icon: Settings }} />
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}

function MobileSidebar({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const sidebarNavItems = useSidebarNav();
  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Home className="h-5 w-5" />
        </div>
        <span className="text-lg font-bold">HomeSync</span>
      </div>
      <nav className="flex-1 space-y-1">
        {sidebarNavItems.map((item) => (
          <NavItem key={item.to} item={item} onClick={onClose} />
        ))}
      </nav>
      <div className="border-t border-border pt-4">
        <NavItem item={{ to: "/settings", label: t("nav.settings"), icon: Settings }} onClick={onClose} />
        <SignOutButton />
      </div>
    </div>
  );
}

function NavItem({
  item,
  onClick,
}: {
  item: { to: string; label: string; icon: React.ComponentType<{ className?: string }> };
  onClick?: () => void;
}) {
  const Icon = item.icon;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = pathname === item.to || pathname.startsWith(`${item.to}/`);

  return (
    <Link
      to={item.to}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function SignOutButton() {
  const { t } = useTranslation();
  return (
    <button
      onClick={() => supabase.auth.signOut()}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
    >
      <LogOut className="h-5 w-5 shrink-0" />
      <span>{t("common.signOut")}</span>
    </button>
  );
}

function MobileBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bottomNavItems = useBottomNav();


  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card pb-safe pt-2">
      <div className="flex items-center justify-around px-2">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "fill-current")} />
              <span className="max-w-[4rem] truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
