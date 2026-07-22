import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

type Expense = {
  id: string;
  amount: number | string;
  description?: string | null;
  category_id?: string | null;
  date: string;
  is_subscription?: boolean;
  recurrence?: string | null;
};
type Category = { id: string; name: string };
type Contribution = { display_name: string; contribution_amount: number | string; contribution_type: string; contribution_value: number | string };

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("es-ES");
}
function catName(id: string | null | undefined, cats: Category[]) {
  return cats.find((c) => c.id === id)?.name || "Sin categoría";
}
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportExpensesCSV(expenses: Expense[], categories: Category[]) {
  const header = ["Fecha", "Descripción", "Categoría", "Importe (€)", "Recurrente", "Recurrencia"];
  const rows = expenses.map((e) => [
    fmtDate(e.date),
    (e.description || "").replace(/"/g, '""'),
    catName(e.category_id, categories).replace(/"/g, '""'),
    Number(e.amount).toFixed(2),
    e.is_subscription ? "Sí" : "No",
    e.recurrence || "",
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${c}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  download(blob, `gastos_${new Date().toISOString().split("T")[0]}.csv`);
}

export function exportFinancesPDF(opts: {
  expenses: Expense[];
  categories: Category[];
  contributions: Contribution[];
  householdName: string;
  totals: { expenses: number; contributions: number; budget: number };
}) {
  const { expenses, categories, contributions, householdName, totals } = opts;
  const doc = new jsPDF();
  const today = new Date().toLocaleDateString("es-ES");

  doc.setFontSize(18);
  doc.text(`Resumen financiero — ${householdName}`, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Generado el ${today}`, 14, 25);
  doc.setTextColor(0);

  doc.setFontSize(12);
  doc.text("Totales", 14, 35);
  autoTable(doc, {
    startY: 38,
    head: [["Concepto", "Importe (€)"]],
    body: [
      ["Aportes totales", totals.contributions.toFixed(2)],
      ["Gastos", totals.expenses.toFixed(2)],
      ["Disponible", (totals.contributions - totals.expenses).toFixed(2)],
      ["Presupuesto", totals.budget.toFixed(2)],
    ],
    theme: "striped",
    headStyles: { fillColor: [30, 41, 59] },
  });

  let y = (doc as any).lastAutoTable.finalY + 10;
  doc.text("Aportes por miembro", 14, y);
  autoTable(doc, {
    startY: y + 3,
    head: [["Miembro", "Tipo", "Valor", "Aporte (€)"]],
    body: contributions.map((c) => [
      c.display_name,
      c.contribution_type === "percentage" ? "Porcentaje" : "Fijo",
      c.contribution_type === "percentage" ? `${Number(c.contribution_value)}%` : `€${Number(c.contribution_value).toFixed(2)}`,
      Number(c.contribution_amount).toFixed(2),
    ]),
    theme: "striped",
    headStyles: { fillColor: [30, 41, 59] },
  });

  // Category breakdown
  const byCat = new Map<string, number>();
  for (const e of expenses) {
    const key = catName(e.category_id, categories);
    byCat.set(key, (byCat.get(key) || 0) + Number(e.amount));
  }
  y = (doc as any).lastAutoTable.finalY + 10;
  doc.text("Gastos por categoría", 14, y);
  autoTable(doc, {
    startY: y + 3,
    head: [["Categoría", "Importe (€)", "%"]],
    body: Array.from(byCat.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => [
        name,
        amount.toFixed(2),
        totals.expenses > 0 ? `${((amount / totals.expenses) * 100).toFixed(1)}%` : "0%",
      ]),
    theme: "striped",
    headStyles: { fillColor: [30, 41, 59] },
  });

  doc.addPage();
  doc.setFontSize(14);
  doc.text("Detalle de gastos", 14, 18);
  autoTable(doc, {
    startY: 22,
    head: [["Fecha", "Descripción", "Categoría", "Importe (€)", "Recurrente"]],
    body: expenses.map((e) => [
      fmtDate(e.date),
      e.description || "",
      catName(e.category_id, categories),
      Number(e.amount).toFixed(2),
      e.is_subscription ? (e.recurrence || "Sí") : "",
    ]),
    theme: "striped",
    headStyles: { fillColor: [30, 41, 59] },
    styles: { fontSize: 9 },
  });

  doc.save(`finanzas_${new Date().toISOString().split("T")[0]}.pdf`);
}
