import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  ClipboardList,
  Clock,
  DollarSign,
  Package,
  ShoppingCart,
  TrendingUp,
  XCircle,
} from "lucide-react";

import { Card, CardTitle } from "@/components/Card";
import { DashboardActions } from "@/components/DashboardActions";
import { DataTable, Td, Th, ViewAllLink } from "@/components/DataTable";
import { PageHeader } from "@/components/shell/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { StockStatusBadge } from "@/components/StockStatusBadge";
import { Donut, type DonutSlice } from "@/components/charts/Donut";
import { MonthlyColumns } from "@/components/charts/MonthlyColumns";
import { NetMovementLine } from "@/components/charts/NetMovementLine";
import { TimeSeriesArea } from "@/components/charts/TimeSeriesArea";
import { seriesColor } from "@/components/charts/chart-tokens";
import { getDashboard, lastChange } from "@/lib/data";
import type { InvoiceStatus, KpiPoint } from "@/lib/types";
import { formatAmount, formatDate, formatInt, formatPercent } from "@/lib/utils";

export const dynamic = "force-dynamic";

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: "Payées",
  pending: "En attente",
  overdue: "En retard",
};

/* Les factures décrivent un état, pas des séries : palette de statut. */
const INVOICE_STATUS_COLOR: Record<InvoiceStatus, string> = {
  paid: "var(--good)",
  pending: "var(--warning)",
  overdue: "var(--critical)",
};

const INVOICE_STATUS_ORDER: InvoiceStatus[] = ["paid", "pending", "overdue"];

export default async function DashboardPage() {
  const data = await getDashboard();

  const history = data.kpiHistory;
  const current = history[history.length - 1];
  const seriesOf = (key: keyof KpiPoint) =>
    history.map((point) => Number(point[key]));

  const currentMovements =
    data.movementsByMonth[data.movementsByMonth.length - 1];

  const categorySlices: DonutSlice[] = data.stockByCategory.map(
    (row, index) => ({
      label: row.category,
      value: row.value,
      color: seriesColor(index),
    })
  );

  const invoiceSlices: DonutSlice[] = INVOICE_STATUS_ORDER.flatMap((status) => {
    const row = data.invoiceStatus.find((item) => item.status === status);
    return row
      ? [
          {
            label: INVOICE_STATUS_LABEL[status],
            value: row.amount,
            color: INVOICE_STATUS_COLOR[status],
          },
        ]
      : [];
  });

  /* La couleur suit la catégorie, jamais son rang dans ce graphique. */
  const categoryOrder = data.stockByCategory.map((row) => row.category);
  const movementSlices = (type: "in" | "out"): DonutSlice[] =>
    data.movementsByCategory
      .filter((row) => row.type === type)
      .map((row) => ({
        label: row.category,
        value: row.value,
        color: seriesColor(Math.max(0, categoryOrder.indexOf(row.category))),
      }))
      .sort((a, b) => b.value - a.value);

  const netMovements = data.movementsByMonth.map((row) => ({
    month: row.month,
    netUnits: row.inbound - row.outbound,
    netValue: row.inbound_value - row.outbound_value,
  }));

  const netUnits = currentMovements.inbound - currentMovements.outbound;
  const netValue =
    currentMovements.inbound_value - currentMovements.outbound_value;

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title="Tableau de bord — Stock & Factures"
        subtitle="Vue d'ensemble en temps réel de votre activité"
        alertCount={data.alerts.outOfStock + data.alerts.overdueInvoices}
        actions={<DashboardActions dashboard={data} />}
      />

      {/* ---- Indicateurs clés ---- */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Articles distincts"
          value={formatInt(current.skus)}
          note="Références en stock"
          series={seriesOf("skus")}
          color="var(--series-1)"
          icon={<Package size={15} strokeWidth={2.2} />}
          change={lastChange(seriesOf("skus"))}
          upIsGood
        />
        <KpiCard
          label="Unités en stock"
          value={formatInt(current.units)}
          note="Unités totales"
          series={seriesOf("units")}
          color="var(--series-3)"
          icon={<Boxes size={15} strokeWidth={2.2} />}
          change={lastChange(seriesOf("units"))}
          upIsGood
        />
        <KpiCard
          label="Valeur totale du stock"
          value={formatAmount(current.value)}
          unit="DT"
          note="Valorisation au prix unitaire"
          series={seriesOf("value")}
          color="var(--series-5)"
          icon={<DollarSign size={15} strokeWidth={2.2} />}
          change={lastChange(seriesOf("value"))}
          upIsGood
        />
        <KpiCard
          label="Produits sous seuil"
          value={formatInt(current.below_min)}
          note="Sous le stock minimum"
          series={seriesOf("below_min")}
          color="var(--serious)"
          icon={<AlertTriangle size={15} strokeWidth={2.2} />}
          change={lastChange(seriesOf("below_min"))}
          upIsGood={false}
        />
        <KpiCard
          label="Produits en rupture"
          value={formatInt(current.out_of_stock)}
          note="Stock épuisé"
          series={seriesOf("out_of_stock")}
          color="var(--critical)"
          icon={<XCircle size={15} strokeWidth={2.2} />}
          change={lastChange(seriesOf("out_of_stock"))}
          upIsGood={false}
        />
        <KpiCard
          label="À réapprovisionner"
          value={formatInt(current.to_reorder)}
          note="Sous le double du seuil"
          series={seriesOf("to_reorder")}
          color="var(--series-2)"
          icon={<ShoppingCart size={15} strokeWidth={2.2} />}
          change={lastChange(seriesOf("to_reorder"))}
          upIsGood={false}
        />
      </div>

      {/* ---- Répartition, évolution, factures ---- */}
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card>
          <CardTitle title="Répartition du stock par catégorie" sub="Valeur" />
          <Donut
            slices={categorySlices}
            centerLabel="Valeur totale"
            total={current.value}
          />
        </Card>

        <Card>
          <CardTitle
            title="Évolution de la valeur du stock"
            sub="DT"
            right={
              <span className="text-[10px] text-[var(--text-muted)]">
                6 derniers mois
              </span>
            }
          />
          <TimeSeriesArea
            data={history.map((point) => ({
              month: point.month,
              value: point.value,
            }))}
            dataKey="value"
            seriesName="Valeur du stock"
          />
        </Card>

        <Card>
          <CardTitle title="État des factures" sub="Valeur" />
          <Donut slices={invoiceSlices} centerLabel="Montant total" />
        </Card>
      </div>

      {/* ---- Tops & volume de factures ---- */}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardTitle title="Top 5 produits par valeur de stock" />
          <DataTable>
            <thead>
              <tr>
                <Th>Produit</Th>
                <Th align="right">Stock</Th>
                <Th align="right">Valeur (DT)</Th>
              </tr>
            </thead>
            <tbody>
              {data.topProductsByValue.map((product) => (
                <tr key={product.name}>
                  <Td>
                    <span className="block max-w-[190px] truncate font-medium">
                      {product.name}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {product.category}
                    </span>
                  </Td>
                  <Td align="right">{formatInt(product.stock)}</Td>
                  <Td align="right">{formatAmount(product.value)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <ViewAllLink href="/products" label="Voir le catalogue" />
        </Card>

        <Card>
          <CardTitle title="Top 5 produits par quantité" />
          <DataTable>
            <thead>
              <tr>
                <Th>Produit</Th>
                <Th align="right">Quantité</Th>
                <Th align="right">Valeur (DT)</Th>
              </tr>
            </thead>
            <tbody>
              {data.topProductsByQuantity.map((product) => (
                <tr key={product.name}>
                  <Td>
                    <span className="block max-w-[190px] truncate font-medium">
                      {product.name}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {product.category}
                    </span>
                  </Td>
                  <Td align="right">{formatInt(product.quantity)}</Td>
                  <Td align="right">{formatAmount(product.value)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <ViewAllLink href="/products" label="Voir le catalogue" />
        </Card>

        <Card>
          <CardTitle title="Top 5 fournisseurs par factures" />
          <DataTable>
            <thead>
              <tr>
                <Th>Fournisseur</Th>
                <Th align="right">Total (DT)</Th>
                <Th align="right">Part</Th>
              </tr>
            </thead>
            <tbody>
              {data.topSuppliers.map((supplier) => (
                <tr key={supplier.supplier}>
                  <Td>
                    <span className="block max-w-[170px] truncate font-medium">
                      {supplier.supplier}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {formatInt(supplier.invoice_count)} factures
                    </span>
                  </Td>
                  <Td align="right">{formatAmount(supplier.total)}</Td>
                  <Td align="right">{formatPercent(supplier.share)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <ViewAllLink href="/suppliers" label="Voir tous les fournisseurs" />
        </Card>

        <Card>
          <CardTitle title="Nombre de factures par mois" />
          <MonthlyColumns
            data={data.invoicesByMonth.map((row) => ({
              month: row.month,
              count: row.count,
              amount: row.amount,
            }))}
            dataKey="count"
            seriesName="Factures émises"
            extraTooltipRow={{ key: "amount", label: "Montant", unit: "DT" }}
          />
        </Card>
      </div>

      {/* ---- Mouvements de stock du mois ---- */}
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card>
          <CardTitle
            title="Entrées du mois"
            sub="Valeur"
            icon={
              <ArrowDownCircle
                size={15}
                strokeWidth={2.2}
                style={{ color: "var(--good)" }}
                aria-hidden
              />
            }
          />
          <div className="mb-3 flex gap-6">
            <div>
              <div className="tnum text-[22px] font-semibold leading-none">
                {formatInt(currentMovements.inbound)}
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">
                Unités entrées
              </div>
            </div>
            <div>
              <div className="tnum text-[22px] font-semibold leading-none">
                {formatAmount(currentMovements.inbound_value)}
                <span className="ml-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                  DT
                </span>
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">
                Valeur des entrées
              </div>
            </div>
          </div>
          <Donut
            slices={movementSlices("in")}
            centerLabel="Entrées"
            size={140}
            total={currentMovements.inbound_value}
          />
        </Card>

        <Card>
          <CardTitle
            title="Sorties du mois"
            sub="Valeur"
            icon={
              <ArrowUpCircle
                size={15}
                strokeWidth={2.2}
                style={{ color: "var(--critical)" }}
                aria-hidden
              />
            }
          />
          <div className="mb-3 flex gap-6">
            <div>
              <div className="tnum text-[22px] font-semibold leading-none">
                {formatInt(currentMovements.outbound)}
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">
                Unités sorties
              </div>
            </div>
            <div>
              <div className="tnum text-[22px] font-semibold leading-none">
                {formatAmount(currentMovements.outbound_value)}
                <span className="ml-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                  DT
                </span>
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">
                Valeur des sorties
              </div>
            </div>
          </div>
          <Donut
            slices={movementSlices("out")}
            centerLabel="Sorties"
            size={140}
            total={currentMovements.outbound_value}
          />
        </Card>

        <Card>
          <CardTitle title="Mouvement net" sub="Entrées − sorties" />
          <div className="mb-2 flex gap-6">
            <div>
              <div
                className="tnum text-[22px] font-semibold leading-none"
                style={{
                  color: netUnits >= 0 ? "var(--delta-up)" : "var(--delta-down)",
                }}
              >
                {netUnits >= 0 ? "+" : "−"}
                {formatInt(Math.abs(netUnits))}
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">
                Unités ce mois
              </div>
            </div>
            <div>
              <div
                className="tnum text-[22px] font-semibold leading-none"
                style={{
                  color: netValue >= 0 ? "var(--delta-up)" : "var(--delta-down)",
                }}
              >
                {netValue >= 0 ? "+" : "−"}
                {formatAmount(Math.abs(netValue))}
                <span className="ml-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                  DT
                </span>
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">
                Valeur nette
              </div>
            </div>
          </div>
          <NetMovementLine data={netMovements} height={150} />
        </Card>
      </div>

      {/* ---- Alertes & performance ---- */}
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card>
          <CardTitle
            title="Produits critiques"
            icon={
              <AlertTriangle
                size={15}
                strokeWidth={2.2}
                style={{ color: "var(--warning)" }}
                aria-hidden
              />
            }
          />
          <DataTable>
            <thead>
              <tr>
                <Th>Produit</Th>
                <Th align="right">Stock</Th>
                <Th align="right">Min.</Th>
                <Th>Statut</Th>
              </tr>
            </thead>
            <tbody>
              {data.criticalProducts.map((product) => (
                <tr key={product.name}>
                  <Td>
                    <span className="block max-w-[150px] truncate font-medium">
                      {product.name}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {product.category}
                    </span>
                  </Td>
                  <Td align="right">{formatInt(product.stock)}</Td>
                  <Td align="right">{formatInt(product.min_stock)}</Td>
                  <Td>
                    <StockStatusBadge status={product.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <ViewAllLink
            href="/products?etat=alerte"
            label="Voir tous les produits en alerte"
          />
        </Card>

        <Card>
          <CardTitle
            title="Factures en retard"
            icon={
              <Clock
                size={15}
                strokeWidth={2.2}
                style={{ color: "var(--critical)" }}
                aria-hidden
              />
            }
          />
          <DataTable>
            <thead>
              <tr>
                <Th>Facture</Th>
                <Th>Échéance</Th>
                <Th align="right">Montant</Th>
                <Th align="right">Retard</Th>
              </tr>
            </thead>
            <tbody>
              {data.overdueInvoices.map((invoice) => (
                <tr key={invoice.number}>
                  <Td>
                    <span className="block font-medium">{invoice.number}</span>
                    <span className="block max-w-[140px] truncate text-[10px] text-[var(--text-muted)]">
                      {invoice.supplier}
                    </span>
                  </Td>
                  <Td nowrap>{formatDate(invoice.due_date)}</Td>
                  <Td align="right">{formatAmount(invoice.amount)}</Td>
                  <Td align="right">
                    <span
                      className="rounded px-1.5 py-0.5 font-medium"
                      style={{
                        background:
                          "color-mix(in srgb, var(--critical) 12%, transparent)",
                        color: "var(--critical)",
                      }}
                    >
                      {invoice.days_late} j
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <ViewAllLink
            href="/invoices?statut=overdue"
            label="Voir toutes les factures en retard"
          />
        </Card>

        <Card>
          <CardTitle
            title="Indicateurs de performance"
            icon={<TrendingUp size={15} strokeWidth={2.2} aria-hidden />}
          />
          <div className="grid grid-cols-2 gap-3">
            <IndicatorTile
              label="Taux de disponibilité"
              value={formatPercent(data.indicators.availabilityRate)}
              note="Références avec stock > 0"
            />
            <IndicatorTile
              label="Rotation du stock"
              value={String(data.indicators.stockTurnover).replace(".", ",")}
              note="Sorties annualisées / stock"
            />
            <IndicatorTile
              label="Délai moyen de paiement"
              value={`${formatInt(data.indicators.avgPaymentDays)} jours`}
              note="Émission → paiement"
            />
            <IndicatorTile
              label="Valeur du stock dormant"
              value={`${formatAmount(data.indicators.dormantValue)} DT`}
              note={`${data.indicators.dormantCount} références sans sortie depuis 90 j`}
            />
          </div>
        </Card>
      </div>

      {/* ---- Points d'attention ---- */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <ClipboardList size={14} aria-hidden />
            Points d&apos;attention
          </span>
          <AlertItem
            color="var(--warning)"
            icon={<AlertTriangle size={13} strokeWidth={2.4} aria-hidden />}
            text={`${formatInt(data.alerts.belowMin)} produits sous le stock minimum`}
          />
          <AlertItem
            color="var(--critical)"
            icon={<XCircle size={13} strokeWidth={2.4} aria-hidden />}
            text={`${formatInt(data.alerts.outOfStock)} produits en rupture de stock`}
          />
          <AlertItem
            color="var(--critical)"
            icon={<Clock size={13} strokeWidth={2.4} aria-hidden />}
            text={`${formatInt(data.alerts.overdueInvoices)} factures en retard à traiter`}
          />
          <AlertItem
            color="var(--series-2)"
            icon={<ShoppingCart size={13} strokeWidth={2.4} aria-hidden />}
            text={`${formatInt(data.alerts.toReorder)} produits à réapprovisionner`}
          />
        </div>
      </Card>
    </main>
  );
}

function IndicatorTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-2.5">
      <div className="text-[9px] font-medium uppercase leading-tight tracking-wider text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-[19px] font-semibold leading-none text-[var(--text-primary)]">
        {value}
      </div>
      <div className="mt-1 text-[10px] leading-tight text-[var(--text-muted)]">
        {note}
      </div>
    </div>
  );
}

function AlertItem({
  color,
  icon,
  text,
}: {
  color: string;
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-primary)]">
      <span style={{ color }} className="flex">
        {icon}
      </span>
      {text}
    </span>
  );
}
