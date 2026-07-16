import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import {
  ShoppingCart,
  ListTodo,
  Calendar,
  Wallet,
  Package,
  ChefHat,
  ArrowRight,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const dashboardQueryOptions = queryOptions({
  queryKey: ["dashboard"],
  queryFn: async () => {
    const householdId = (await supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const [{ data: tasks }, { data: shopping }, { data: events }, { data: expenses }] =
      await Promise.all([
        supabase.from("tasks").select("*").eq("household_id", householdId).eq("status", "pending").limit(5),
        supabase
          .from("shopping_list_items")
          .select("*, shopping_list:shopping_list_id(store_id, name)")
          .eq("checked", false)
          .limit(5),
        supabase
          .from("calendar_events")
          .select("*")
          .eq("household_id", householdId)
          .gte("start_at", new Date().toISOString())
          .order("start_at", { ascending: true })
          .limit(5),
        supabase
          .from("expenses")
          .select("*")
          .eq("household_id", householdId)
          .gte("date", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
          .limit(5),
      ]);

    return { tasks: tasks ?? [], shopping: shopping ?? [], events: events ?? [], expenses: expenses ?? [], householdId };
  },
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQueryOptions),
  head: () => ({
    meta: [{ title: "Dashboard - HomeSync" }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data } = useSuspenseQuery(dashboardQueryOptions);

  const totalExpenses = data.expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-bold tracking-tight">Buenos días</h2>
        <p className="text-muted-foreground">Resumen de tu hogar hoy</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Tareas pendientes"
          value={data.tasks.length}
          icon={ListTodo}
          href="/tasks"
          color="text-chart-1"
        />
        <SummaryCard
          title="Por comprar"
          value={data.shopping.length}
          icon={ShoppingCart}
          href="/shopping"
          color="text-chart-2"
        />
        <SummaryCard
          title="Próximos eventos"
          value={data.events.length}
          icon={Calendar}
          href="/calendar"
          color="text-chart-3"
        />
        <SummaryCard
          title="Gastos mes"
          value={`€${totalExpenses.toFixed(2)}`}
          icon={Wallet}
          href="/finances"
          color="text-chart-4"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold">Tareas urgentes</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tasks">Ver todas</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.tasks.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay tareas pendientes.</p>
            )}
            {data.tasks.slice(0, 4).map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div>
                  <p className="font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {task.due_date ? new Date(task.due_date).toLocaleDateString("es-ES") : "Sin fecha"}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold">Lista de compra</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/shopping">Ver todo</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.shopping.length === 0 && (
              <p className="text-sm text-muted-foreground">La lista de compra está vacía.</p>
            )}
            {data.shopping.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} {item.unit || "ud."}
                  </p>
                </div>
                <span className="text-sm font-medium text-primary">
                  {item.manual_price || item.ocr_price ? `€${(item.manual_price || item.ocr_price)}` : ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Inventario bajo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Revisa productos con stock mínimo.</p>
            <Button className="mt-4 w-full" variant="outline" asChild>
              <Link to="/inventory">Ir al inventario</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Recetas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Sugerencias basadas en tu inventario.</p>
            <Button className="mt-4 w-full" variant="outline" asChild>
              <Link to="/recipes">Ver recetas</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Presupuesto</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Control de gastos del mes.</p>
            <Progress value={Math.min((totalExpenses / 1000) * 100, 100)} className="mt-4" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  href,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  color: string;
}) {
  return (
    <Link to={href}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary">
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
