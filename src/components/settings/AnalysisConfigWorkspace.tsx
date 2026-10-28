"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Copy,
  FlaskConical,
  History,
  Info,
  Loader2,
  NotebookPen,
  Pencil,
  Plus,
  PlusCircle,
  Printer,
  Save,
  ScrollText,
  ShieldCheck,
  Syringe,
  TestTubes,
  Trash2,
  TriangleAlert,
  Workflow,
  X,
} from "lucide-react";
import {
  saveAnalysisConfig,
  type AnalysisConfigInput,
} from "@/app/(app)/settings/analyses/actions";
import { Switch } from "./LabSettingsWorkspace";
import { cn, formatDateTime, formatInt } from "@/lib/utils";
import type {
  AnalysisConfigData,
  AnalysisItemRole,
  InstrumentStatus,
} from "@/lib/types";

const INPUT_CLASS =
  "h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)] disabled:opacity-70";
const CELL =
  "h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]";

const CATEGORIES = [
  "Biochimie",
  "Hématologie",
  "Hémostase",
  "Immunologie",
  "Microbiologie",
  "Parasitologie",
  "Sérologie",
  "Hormonologie",
  "Biologie moléculaire",
];
const TURNAROUND = [2, 4, 6, 12, 24, 48, 72, 96];
const SAMPLE_TYPES = ["Sérum", "Plasma", "Sang total", "Urines (milieu de jet)", "Selles", "LCR", "Écouvillon", "Expectoration"];
const TUBES = ["Tube sec (Sérum)", "Tube EDTA", "Tube citraté", "Tube hépariné", "Tube fluoré", "Flacon stérile", "Pot stérile"];
const TRANSPORT = ["Température ambiante", "Réfrigéré (2–8 °C)", "Congelé", "À l'abri de la lumière"];
const UNITS = ["pièce", "mL", "µL", "test", "kit", "boîte", "disque", "lame"];

const STATUS_LABEL: Record<InstrumentStatus, { label: string; color: string }> = {
  in_service: { label: "En service", color: "var(--good)" },
  maintenance: { label: "En maintenance", color: "var(--warning)" },
  out_of_service: { label: "Hors service", color: "var(--critical)" },
};

type Item = {
  key: number;
  product_id: number | "";
  role: AnalysisItemRole;
  coefficient: string;
  consumption_unit: string;
  auto_destock: boolean;
  condition: string;
  germ_type: string;
  incubation: string;
};

let itemKey = 0;
const nextKey = () => ++itemKey;

function blankItem(role: AnalysisItemRole): Item {
  return {
    key: nextKey(),
    product_id: "",
    role,
    coefficient: "1",
    consumption_unit: role === "antibiotic" ? "disque" : role === "reagent" ? "test" : "pièce",
    auto_destock: true,
    condition: "",
    germ_type: "",
    incubation: role === "culture" ? "37 °C / 24 h" : "",
  };
}

function parseQty(raw: string) {
  return Number.parseFloat(raw.replace(/\s/g, "").replace(",", "."));
}

function formatQty(n: number) {
  return String(Math.round(n * 10000) / 10000).replace(".", ",");
}

export function AnalysisConfigWorkspace({
  data,
  isAdmin,
  notice,
}: {
  data: AnalysisConfigData;
  isAdmin: boolean;
  notice: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean } | null>(
    notice ? { message: notice, ok: true } : null
  );
  const current = data.current;
  const readOnly = !isAdmin;

  const [analysisId, setAnalysisId] = useState<number | null>(current?.id ?? null);
  const [analysis, setAnalysis] = useState({
    code: current?.code ?? "",
    name: current?.name ?? "",
    category: current?.category ?? "",
    description: current?.description ?? "",
    turnaround_hours: current?.turnaround_hours ?? (24 as number | null),
    sample_type: current?.sample_type ?? "",
    tube: current?.tube ?? "",
    sample_volume_ml: current?.sample_volume_ml ?? (null as number | null),
    transport_conditions: current?.transport_conditions ?? "",
    urgent_allowed: current?.urgent_allowed ?? false,
    bio_validation_required: current?.bio_validation_required ?? true,
    microscopy_control: current?.microscopy_control ?? false,
    active: current?.active ?? true,
    notes: current?.notes ?? "",
  });

  const initialInstrument = data.instruments.find((i) => i.id === current?.instrument_id) ?? null;
  const [instrumentChoice, setInstrumentChoice] = useState<number | "" | "new">(
    initialInstrument?.id ?? ""
  );
  const [instrument, setInstrument] = useState({
    name: initialInstrument?.name ?? "",
    category: initialInstrument?.category ?? "",
    status: initialInstrument?.status ?? ("in_service" as InstrumentStatus),
    lis_interface: initialInstrument?.lis_interface ?? false,
    calibration: initialInstrument?.calibration ?? "",
    maintenance: initialInstrument?.maintenance ?? "",
  });

  const [items, setItems] = useState<Item[]>(() =>
    (current?.items ?? []).map((item) => ({
      key: nextKey(),
      product_id: item.product_id,
      role: item.role,
      coefficient: formatQty(item.coefficient),
      consumption_unit: item.consumption_unit ?? "",
      auto_destock: item.auto_destock,
      condition: item.condition ?? "",
      germ_type: item.germ_type ?? "",
      incubation: item.incubation ?? "",
    }))
  );
  const [samples, setSamples] = useState("10");
  const [showHistory, setShowHistory] = useState(false);

  const productById = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);
  const ofRole = (role: AnalysisItemRole) => items.filter((item) => item.role === role);

  function patchItem(key: number, values: Partial<Item>) {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...values } : item)));
  }
  function removeItem(key: number) {
    setItems((list) => list.filter((item) => item.key !== key));
  }
  function addItem(role: AnalysisItemRole) {
    setItems((list) => [...list, blankItem(role)]);
  }

  function chooseInstrument(value: string) {
    if (value === "" || value === "new") {
      setInstrumentChoice(value === "" ? "" : "new");
      setInstrument({ name: "", category: "", status: "in_service", lis_interface: false, calibration: "", maintenance: "" });
      return;
    }
    const picked = data.instruments.find((i) => i.id === Number(value));
    if (!picked) return;
    setInstrumentChoice(picked.id);
    setInstrument({
      name: picked.name,
      category: picked.category ?? "",
      status: picked.status,
      lis_interface: picked.lis_interface,
      calibration: picked.calibration ?? "",
      maintenance: picked.maintenance ?? "",
    });
  }

  /* Contrôles avant enregistrement, dits à l'écran plutôt que découverts
     dans le message d'erreur de la base. */
  const problems: string[] = [];
  if (!analysis.code.trim()) problems.push("Code LIS manquant");
  if (!analysis.name.trim()) problems.push("Nom de l'analyse manquant");
  if (!analysis.category.trim()) problems.push("Catégorie manquante");
  if (items.some((i) => i.product_id === "")) problems.push("Une ligne n'a pas d'article");
  if (items.some((i) => !(parseQty(i.coefficient) > 0))) problems.push("Une quantité par test est invalide");
  const ids = items.filter((i) => i.product_id !== "").map((i) => i.product_id);
  if (new Set(ids).size !== ids.length) problems.push("Un article figure deux fois");
  if (instrumentChoice === "new" && !instrument.name.trim()) problems.push("Nom du nouvel automate manquant");

  function save() {
    setFeedback(null);
    const input: AnalysisConfigInput = {
      id: analysisId,
      analysis,
      instrument:
        instrumentChoice === ""
          ? null
          : { id: instrumentChoice === "new" ? null : instrumentChoice, ...instrument },
      items: items.map((item) => ({
        product_id: Number(item.product_id),
        role: item.role,
        coefficient: parseQty(item.coefficient),
        consumption_unit: item.consumption_unit,
        auto_destock: item.auto_destock,
        condition: item.auto_destock ? "" : item.condition,
        germ_type: item.germ_type,
        incubation: item.incubation,
      })),
    };
    start(async () => {
      const result = await saveAnalysisConfig(input);
      setFeedback({ ok: result.status === "success", message: result.message });
      if (result.status !== "success") return;
      if (analysisId === null && result.analysisId)
        router.replace(`/settings/analyses?id=${result.analysisId}&info=${encodeURIComponent(result.message)}`);
      else router.refresh();
    });
  }

  function duplicate() {
    setAnalysisId(null);
    setAnalysis((a) => ({ ...a, code: `${a.code}-COPIE`, name: `${a.name} (copie)` }));
    setItems((list) => list.map((item) => ({ ...item, key: nextKey() })));
    setFeedback({
      ok: true,
      message: "Copie prête : ajustez le code et le nom, puis enregistrez pour créer la nouvelle analyse.",
    });
  }

  const autoItems = items.filter((i) => i.auto_destock && i.product_id !== "");
  const manualItems = items.filter((i) => !i.auto_destock && i.product_id !== "");
  const sampleCount = Math.max(0, Number.parseInt(samples, 10) || 0);
  const sectionTitle = "flex items-center gap-2 text-[12px] font-bold text-[var(--text-primary)]";
  const topButton =
    "flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--page)] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex flex-col gap-3">
      {/* Barre d'outils */}
      <div className="card flex flex-wrap items-center gap-2 p-2.5">
        <Link href="/settings" className={topButton}>
          <ArrowLeft size={14} strokeWidth={2.2} aria-hidden />
          Retour
        </Link>
        <select
          value={analysisId ?? ""}
          onChange={(event) =>
            router.push(event.target.value === "" ? "/settings/analyses?nouvelle=1" : `/settings/analyses?id=${event.target.value}`)
          }
          aria-label="Analyse à configurer"
          className={cn(INPUT_CLASS, "w-auto min-w-[260px] max-w-[420px] font-semibold")}
        >
          {analysisId === null ? <option value="">— Nouvelle analyse (non enregistrée) —</option> : null}
          {data.analyses.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} · {a.name}
              {a.active ? "" : " (inactive)"} — {a.item_count} ligne(s)
            </option>
          ))}
        </select>
        {isAdmin ? (
          <Link href="/settings/analyses?nouvelle=1" className={topButton}>
            <Plus size={14} strokeWidth={2.4} aria-hidden />
            Nouvelle analyse
          </Link>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" disabled={readOnly || analysisId === null} onClick={duplicate} className={topButton}>
            <Copy size={14} strokeWidth={2.2} aria-hidden />
            Dupliquer
          </button>
          <button
            type="button"
            disabled={!current}
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            className={topButton}
          >
            <History size={14} strokeWidth={2.2} aria-hidden />
            Historique
          </button>
          <button
            type="button"
            disabled={analysisId === null}
            onClick={() => window.open(`/settings/analyses/${analysisId}/print`, "_blank")}
            className={topButton}
          >
            <Printer size={14} strokeWidth={2.2} aria-hidden />
            Imprimer
          </button>
          <button
            type="button"
            disabled={readOnly || pending || problems.length > 0}
            onClick={save}
            title={readOnly ? "Réservé à l'administrateur" : problems.join(" · ") || undefined}
            className="flex h-9 items-center gap-1.5 rounded-lg px-4 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--series-1)" }}
          >
            {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Save size={14} strokeWidth={2.2} aria-hidden />}
            Enregistrer
          </button>
        </div>
      </div>

      {showHistory && current ? (
        <p className="card flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--text-secondary)]">
          <History size={14} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
          {current.updated_at
            ? `Dernière modification le ${formatDateTime(current.updated_at)}${current.updated_by ? ` par ${current.updated_by}` : ""}.`
            : "Configuration jamais modifiée depuis cet écran."}
          <span className="text-[var(--text-muted)]">Le journal détaillé des versions n&apos;est pas encore tenu.</span>
        </p>
      ) : null}

      {feedback ? (
        <div
          role="status"
          className="card flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium"
          style={{ color: feedback.ok ? "var(--good)" : "var(--critical)" }}
        >
          {feedback.ok ? <CheckCircle2 size={14} strokeWidth={2.2} aria-hidden /> : <TriangleAlert size={14} strokeWidth={2.2} aria-hidden />}
          {feedback.message}
          <button type="button" onClick={() => setFeedback(null)} className="ml-auto rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--page)]">
            <X size={12} strokeWidth={2.2} aria-hidden />
            <span className="sr-only">Fermer</span>
          </button>
        </div>
      ) : null}

      {readOnly ? (
        <p className="card flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--text-secondary)]">
          <Info size={14} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
          Consultation seule : un coefficient engage tous les déstockages à venir, sa modification est réservée à l&apos;administrateur.
        </p>
      ) : null}

      {/* Onglets */}
      <nav className="card flex gap-1 overflow-x-auto p-1.5" aria-label="Rubriques de l'analyse">
        {[
          { label: "1. Détail d'analyse", href: "#detail", Icon: FlaskConical },
          { label: "2. Prélèvement", href: "#prelevement", Icon: Syringe },
          { label: "3. Automates & Méthodes", href: "#automate", Icon: Workflow },
          { label: "4. Réactifs & Consommables", href: "#consommables", Icon: Boxes },
          { label: "5. Règles & Protocoles", href: "#protocoles", Icon: ScrollText },
          { label: "6. Déstockage automatique", href: "#destockage", Icon: ClipboardList },
          { label: "7. Traçabilité & Validation", href: "#tracabilite", Icon: ShieldCheck },
        ].map((tab, index) => (
          <a
            key={tab.label}
            href={tab.href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-semibold",
              index === 0 ? "text-white" : "text-[var(--text-secondary)] hover:bg-[var(--page)]"
            )}
            style={index === 0 ? { background: "var(--text-primary)" } : undefined}
          >
            <tab.Icon size={13} strokeWidth={2.2} aria-hidden />
            {tab.label}
          </a>
        ))}
      </nav>

      <fieldset disabled={readOnly} className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          {/* 1. Détail */}
          <section id="detail" className="card scroll-mt-4 p-4">
            <h2 className={cn(sectionTitle, "mb-3")}>
              <FlaskConical size={16} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
              1. Détail de l&apos;analyse
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[140px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <Field label="Code LIS" required>
                <input value={analysis.code} onChange={(e) => setAnalysis({ ...analysis, code: e.target.value.toUpperCase() })} placeholder="ECBU" className={cn(INPUT_CLASS, "tnum font-semibold")} />
              </Field>
              <Field label="Nom de l'analyse" required>
                <input value={analysis.name} onChange={(e) => setAnalysis({ ...analysis, name: e.target.value })} placeholder="Examen cytobactériologique des urines" className={INPUT_CLASS} />
              </Field>
              <Field label="Catégorie" required>
                <select value={analysis.category} onChange={(e) => setAnalysis({ ...analysis, category: e.target.value })} className={INPUT_CLASS}>
                  <option value="">— Choisir —</option>
                  {withCurrent(CATEGORIES, analysis.category).map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Délai rendu" required>
                <select
                  value={analysis.turnaround_hours ?? ""}
                  onChange={(e) => setAnalysis({ ...analysis, turnaround_hours: e.target.value === "" ? null : Number(e.target.value) })}
                  className={INPUT_CLASS}
                >
                  <option value="">—</option>
                  {withCurrentNumber(TURNAROUND, analysis.turnaround_hours).map((h) => (
                    <option key={h} value={h}>{h} heures</option>
                  ))}
                </select>
              </Field>
              <Field label="Type d'échantillon" required>
                <select value={analysis.sample_type} onChange={(e) => setAnalysis({ ...analysis, sample_type: e.target.value })} className={INPUT_CLASS}>
                  <option value="">— Choisir —</option>
                  {withCurrent(SAMPLE_TYPES, analysis.sample_type).map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Description" className="sm:col-span-2 lg:col-span-5">
                <textarea
                  value={analysis.description}
                  onChange={(e) => setAnalysis({ ...analysis, description: e.target.value })}
                  rows={2}
                  placeholder="Recherche et identification des germes responsables d'infection urinaire avec antibiogramme."
                  className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)]"
                />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-2">
              <SwitchField label="Analyse urgente possible" checked={analysis.urgent_allowed} onChange={(v) => setAnalysis({ ...analysis, urgent_allowed: v })} />
              <SwitchField label="Validation biologique obligatoire" checked={analysis.bio_validation_required} onChange={(v) => setAnalysis({ ...analysis, bio_validation_required: v })} />
              <SwitchField
                label="Statut"
                checked={analysis.active}
                onChange={(v) => setAnalysis({ ...analysis, active: v })}
                on="Actif"
                off="Inactif"
              />
            </div>
            {!analysis.active ? (
              <p className="mt-2 text-[10px]" style={{ color: "var(--warning)" }}>
                Une analyse inactive n&apos;est plus déstockée automatiquement.
              </p>
            ) : null}
          </section>

          {/* 2. Prélèvement */}
          <section id="prelevement" className="card scroll-mt-4 p-4">
            <h2 className={cn(sectionTitle, "mb-3")}>
              <Syringe size={16} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
              2. Prélèvement
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Tube / contenant">
                <select value={analysis.tube} onChange={(e) => setAnalysis({ ...analysis, tube: e.target.value })} className={INPUT_CLASS}>
                  <option value="">— Choisir —</option>
                  {withCurrent(TUBES, analysis.tube).map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Volume requis (mL)">
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={analysis.sample_volume_ml ?? ""}
                  onChange={(e) => setAnalysis({ ...analysis, sample_volume_ml: e.target.value === "" ? null : Number(e.target.value) })}
                  className={cn(INPUT_CLASS, "tnum")}
                />
              </Field>
              <Field label="Conditions de transport">
                <select value={analysis.transport_conditions} onChange={(e) => setAnalysis({ ...analysis, transport_conditions: e.target.value })} className={INPUT_CLASS}>
                  <option value="">— Choisir —</option>
                  {withCurrent(TRANSPORT, analysis.transport_conditions).map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
            </div>
          </section>

          {/* Consommables */}
          <section id="consommables" className="card scroll-mt-4 p-4">
            <h2 className={cn(sectionTitle, "mb-3")}>
              <Boxes size={16} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
              Détail du consommable
            </h2>
            <ItemTable
              rows={ofRole("consumable")}
              variant="stock"
              products={data.products}
              productById={productById}
              onPatch={patchItem}
              onRemove={removeItem}
            />
            <AddLine onClick={() => addItem("consumable")} />
          </section>

          {/* 3. Automate */}
          <section id="automate" className="card scroll-mt-4 p-4">
            <h2 className={cn(sectionTitle, "mb-3")}>
              <Workflow size={16} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
              3. Détail de l&apos;automate
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Modèle">
                <select value={instrumentChoice} onChange={(e) => chooseInstrument(e.target.value)} className={cn(INPUT_CLASS, "font-semibold")}>
                  <option value="">— Aucun automate (méthode manuelle) —</option>
                  {data.instruments.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                  <option value="new">+ Nouvel automate…</option>
                </select>
              </Field>
              {instrumentChoice !== "" ? (
                <>
                  <Field label={instrumentChoice === "new" ? "Nom du modèle" : "Catégorie"} required={instrumentChoice === "new"}>
                    {instrumentChoice === "new" ? (
                      <input value={instrument.name} onChange={(e) => setInstrument({ ...instrument, name: e.target.value })} placeholder="BD BACTEC FX" className={INPUT_CLASS} />
                    ) : (
                      <input value={instrument.category} onChange={(e) => setInstrument({ ...instrument, category: e.target.value })} placeholder="Automate de culture" className={INPUT_CLASS} />
                    )}
                  </Field>
                  <Field label="Statut" required>
                    <select
                      value={instrument.status}
                      onChange={(e) => setInstrument({ ...instrument, status: e.target.value as InstrumentStatus })}
                      className={cn(INPUT_CLASS, "font-semibold")}
                      style={{ color: STATUS_LABEL[instrument.status].color }}
                    >
                      {(Object.keys(STATUS_LABEL) as InstrumentStatus[]).map((s) => (
                        <option key={s} value={s}>{STATUS_LABEL[s].label}</option>
                      ))}
                    </select>
                  </Field>
                  {instrumentChoice === "new" ? (
                    <Field label="Catégorie">
                      <input value={instrument.category} onChange={(e) => setInstrument({ ...instrument, category: e.target.value })} placeholder="Automate de culture" className={INPUT_CLASS} />
                    </Field>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-w-0">
                <h3 className="mb-2 text-[11px] font-bold text-[var(--text-primary)]">Principaux réactifs</h3>
                <ItemTable
                  rows={ofRole("reagent")}
                  variant="stock"
                  products={data.products}
                  productById={productById}
                  onPatch={patchItem}
                  onRemove={removeItem}
                />
                <AddLine onClick={() => addItem("reagent")} />
              </div>
              <div className={cn("rounded-lg border border-[var(--border)] p-3", instrumentChoice === "" && "opacity-50")}>
                <h3 className="mb-2 text-[11px] font-bold text-[var(--text-primary)]">Paramètres de l&apos;automate</h3>
                <fieldset disabled={instrumentChoice === ""} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[var(--text-secondary)]">Interface LIS</span>
                    <Switch checked={instrument.lis_interface} onChange={(v) => setInstrument({ ...instrument, lis_interface: v })} label="Interface LIS" />
                  </div>
                  <Field label="Calibration">
                    <input value={instrument.calibration} onChange={(e) => setInstrument({ ...instrument, calibration: e.target.value })} placeholder="Automatique (hebdo)" className={INPUT_CLASS} />
                  </Field>
                  <Field label="Maintenance">
                    <input value={instrument.maintenance} onChange={(e) => setInstrument({ ...instrument, maintenance: e.target.value })} placeholder="Selon le fabricant" className={INPUT_CLASS} />
                  </Field>
                </fieldset>
                {typeof instrumentChoice === "number" ? (
                  <p className="mt-2 text-[9px] text-[var(--text-muted)]">
                    L&apos;automate est partagé : ces paramètres valent pour toutes les analyses qui l&apos;utilisent.
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          {/* 4. Protocoles */}
          <section id="protocoles" className="card scroll-mt-4 p-4">
            <h2 className={cn(sectionTitle, "mb-3")}>
              <TestTubes size={16} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
              4. Protocoles cultures
            </h2>
            <div className="grid gap-4 2xl:grid-cols-2">
              <div className="min-w-0">
                <h3 className="mb-2 text-[11px] font-bold text-[var(--text-primary)]">Culture bactérienne</h3>
                <ItemTable rows={ofRole("culture")} variant="culture" products={data.products} productById={productById} onPatch={patchItem} onRemove={removeItem} />
                <AddLine onClick={() => addItem("culture")} />
              </div>
              <div className="min-w-0">
                <h3 className="mb-2 text-[11px] font-bold text-[var(--text-primary)]">Disques antibiotiques selon CASFM</h3>
                <ItemTable rows={ofRole("antibiotic")} variant="antibiotic" products={data.products} productById={productById} onPatch={patchItem} onRemove={removeItem} />
                <AddLine onClick={() => addItem("antibiotic")} />
              </div>
            </div>
          </section>
        </div>

        {/* Panneau droit */}
        <aside className="space-y-3">
          <section className="card p-4">
            <h2 className={cn(sectionTitle, "mb-1")}>
              <NotebookPen size={15} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
              Consommables spécifiques (manuel)
            </h2>
            <p className="mb-2 text-[10px] text-[var(--text-muted)]">
              Lignes « selon règle » : sorties à la main quand leur condition est remplie.
            </p>
            {manualItems.length === 0 ? (
              <p className="py-2 text-center text-[11px] text-[var(--text-muted)]">Aucune ligne manuelle.</p>
            ) : (
              <ul className="space-y-1.5">
                {manualItems.map((item) => (
                  <li key={item.key} className="rounded-lg bg-[var(--page)] px-2.5 py-1.5 text-[11px]">
                    <span className="flex justify-between gap-2">
                      <span className="truncate font-semibold text-[var(--text-primary)]">
                        {productById.get(Number(item.product_id))?.name ?? "—"}
                      </span>
                      <span className="tnum shrink-0">
                        {item.coefficient} {item.consumption_unit}
                      </span>
                    </span>
                    <span className="block text-[10px] text-[var(--text-secondary)]">
                      {item.condition || "Condition non précisée"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="destockage" className="card scroll-mt-4 p-4">
            <h2 className={cn(sectionTitle, "mb-2")}>
              <ClipboardList size={15} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
              6. Déstockage automatique
            </h2>
            <label className="mb-2 flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
              Pour
              <input
                type="number"
                min={1}
                value={samples}
                onChange={(e) => setSamples(e.target.value)}
                className={cn(CELL, "w-16 text-right tnum")}
              />
              échantillon(s) :
            </label>
            {!analysis.active ? (
              <p className="text-[11px]" style={{ color: "var(--warning)" }}>Analyse inactive : rien n&apos;est déduit.</p>
            ) : autoItems.length === 0 ? (
              <p className="py-2 text-center text-[11px] text-[var(--text-muted)]">Aucune ligne déstockée automatiquement.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {autoItems.map((item) => {
                  const qty = parseQty(item.coefficient);
                  return (
                    <li key={item.key} className="flex justify-between gap-2 py-1.5 text-[11px]">
                      <span className="truncate text-[var(--text-primary)]">
                        {productById.get(Number(item.product_id))?.name ?? "—"}
                      </span>
                      <span className="tnum shrink-0 font-semibold">
                        {Number.isFinite(qty) ? formatInt(Math.ceil(qty * sampleCount)) : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-[9px] text-[var(--text-muted)]">
              Quantité par test × échantillons, arrondie à l&apos;unité supérieure, sortie en FEFO.
            </p>
          </section>

          <section className="card p-4">
            <h2 className={cn(sectionTitle, "mb-2")}>
              <FlaskConical size={15} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
              Réactifs &amp; méthodes
            </h2>
            <dl className="space-y-1 text-[11px]">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-secondary)]">Méthode</dt>
                <dd className="truncate text-right font-semibold">
                  {instrumentChoice === "" ? "Manuelle" : instrument.name || "Nouvel automate"}
                </dd>
              </div>
              {ofRole("reagent").map((item) => (
                <div key={item.key} className="flex justify-between gap-2">
                  <dt className="truncate text-[var(--text-secondary)]">
                    {productById.get(Number(item.product_id))?.name ?? "Réactif à choisir"}
                  </dt>
                  <dd className="tnum shrink-0">
                    {item.coefficient} {item.consumption_unit}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section id="tracabilite" className="card scroll-mt-4 p-4">
            <h2 className={cn(sectionTitle, "mb-2")}>
              <ShieldCheck size={15} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
              7. Traçabilité &amp; validation
            </h2>
            <div className="divide-y divide-[var(--border)]">
              <div className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-[11px] text-[var(--text-primary)]">Contrôle microscopique</span>
                <Switch checked={analysis.microscopy_control} onChange={(v) => setAnalysis({ ...analysis, microscopy_control: v })} label="Contrôle microscopique" />
              </div>
              <div className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-[11px] text-[var(--text-primary)]">Validation biologique</span>
                <span className="text-[11px] font-semibold" style={{ color: analysis.bio_validation_required ? "var(--good)" : "var(--text-muted)" }}>
                  {analysis.bio_validation_required ? "Obligatoire" : "Facultative"}
                </span>
              </div>
              <div className="py-1.5 text-[10px] text-[var(--text-muted)]">
                {current?.updated_at
                  ? `Modifiée le ${formatDateTime(current.updated_at)}${current.updated_by ? ` par ${current.updated_by}` : ""}`
                  : "Pas encore modifiée depuis cet écran"}
              </div>
            </div>
          </section>

          <section className="card p-4">
            <h2 className={cn(sectionTitle, "mb-2")}>
              <Pencil size={15} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
              Notes &amp; remarques
            </h2>
            <textarea
              value={analysis.notes}
              onChange={(e) => setAnalysis({ ...analysis, notes: e.target.value })}
              rows={4}
              placeholder="Ex. : si ECBU positif, compléter par l'antibiogramme selon le germe identifié."
              className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)]"
            />
          </section>
        </aside>
      </fieldset>

      <p
        className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[11px] text-[var(--text-secondary)]"
        style={{ background: "color-mix(in srgb, var(--series-1) 8%, transparent)" }}
      >
        <Info size={14} strokeWidth={2.2} className="mt-px shrink-0" style={{ color: "var(--series-1)" }} aria-hidden />
        Cette configuration respecte les exigences de la norme ISO 15189:2022 pour la gestion des processus
        pré-analytiques, analytiques et post-analytiques, avec traçabilité complète et maîtrise des risques.
      </p>
    </div>
  );
}

function withCurrent(options: string[], value: string) {
  return value && !options.includes(value) ? [value, ...options] : options;
}

function withCurrentNumber(options: number[], value: number | null) {
  return value !== null && !options.includes(value) ? [...options, value].sort((a, b) => a - b) : options;
}

function AddLine({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--series-1)] hover:bg-[var(--page)]"
    >
      <PlusCircle size={13} strokeWidth={2.2} aria-hidden />
      Ajouter une ligne
    </button>
  );
}

function ItemTable({
  rows,
  variant,
  products,
  productById,
  onPatch,
  onRemove,
}: {
  rows: Item[];
  variant: "stock" | "culture" | "antibiotic";
  products: AnalysisConfigData["products"];
  productById: Map<number, AnalysisConfigData["products"][number]>;
  onPatch: (key: number, values: Partial<Item>) => void;
  onRemove: (key: number) => void;
}) {
  const head = "px-2 py-2 text-left text-[10px] font-semibold";
  const productSelect = (row: Item) => (
    <select
      value={row.product_id}
      onChange={(e) => onPatch(row.key, { product_id: e.target.value === "" ? "" : Number(e.target.value) })}
      aria-label="Article"
      className={cn(CELL, "min-w-[160px] font-semibold", row.product_id === "" && "border-[var(--critical)]")}
    >
      <option value="">— Article —</option>
      {products.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.reference ? ` (${p.reference})` : ""}
        </option>
      ))}
    </select>
  );
  const qty = (row: Item) => (
    <input
      inputMode="decimal"
      value={row.coefficient}
      onChange={(e) => onPatch(row.key, { coefficient: e.target.value })}
      aria-label="Quantité par test"
      className={cn(CELL, "w-16 text-right tnum", !(parseQty(row.coefficient) > 0) && "border-[var(--critical)]")}
    />
  );
  const remove = (row: Item) => (
    <button
      type="button"
      onClick={() => onRemove(row.key)}
      aria-label="Retirer la ligne"
      className="grid h-7 w-7 place-items-center rounded-md hover:bg-[var(--page)]"
      style={{ color: "var(--critical)" }}
    >
      <Trash2 size={13} strokeWidth={2.2} aria-hidden />
    </button>
  );

  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-[11px]">
        <thead className="bg-[var(--page)] text-[var(--text-secondary)]">
          {variant === "stock" ? (
            <tr>
              <th className={cn(head, "rounded-l-lg")}>Article</th>
              <th className={head}>Conditionnement</th>
              <th className={head}>Unité de consommation</th>
              <th className={cn(head, "text-right")}>Quantité par test</th>
              <th className={head}>Déstockage auto</th>
              <th className={cn(head, "w-10 rounded-r-lg")}><span className="sr-only">Actions</span></th>
            </tr>
          ) : (
            <tr>
              <th className={cn(head, "rounded-l-lg")}>Type de germe</th>
              <th className={head}>Article</th>
              <th className={cn(head, "text-right")}>Quantité</th>
              {variant === "culture" ? <th className={head}>Culture</th> : null}
              <th className={head}>Déstockage auto</th>
              <th className={cn(head, "w-10 rounded-r-lg")}><span className="sr-only">Actions</span></th>
            </tr>
          )}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-4 text-center text-[var(--text-muted)]">Aucune ligne.</td>
            </tr>
          ) : (
            rows.map((row) => {
              const autoCell = (
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5">
                    <Switch checked={row.auto_destock} onChange={(v) => onPatch(row.key, { auto_destock: v })} label="Déstockage automatique" />
                    <span className="text-[10px] font-semibold" style={{ color: row.auto_destock ? "var(--good)" : "var(--text-secondary)" }}>
                      {row.auto_destock ? "Oui" : "Selon règle"}
                    </span>
                  </span>
                  {!row.auto_destock ? (
                    <input
                      value={row.condition}
                      onChange={(e) => onPatch(row.key, { condition: e.target.value })}
                      placeholder="Condition (ex. si contrôle microscopique)"
                      className={cn(CELL, "h-7 text-[10px]")}
                    />
                  ) : null}
                </div>
              );
              if (variant === "stock") {
                const product = row.product_id === "" ? null : productById.get(row.product_id);
                return (
                  <tr key={row.key} className="border-b border-[var(--border)] align-top">
                    <td className="px-1 py-1.5">{productSelect(row)}</td>
                    <td className="px-2 py-1.5 pt-3 text-[var(--text-secondary)]">{product?.packaging ?? "—"}</td>
                    <td className="px-1 py-1.5">
                      <select value={row.consumption_unit} onChange={(e) => onPatch(row.key, { consumption_unit: e.target.value })} aria-label="Unité de consommation" className={cn(CELL, "w-24")}>
                        <option value="">—</option>
                        {withCurrent(UNITS, row.consumption_unit).map((u) => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-1.5 text-right">{qty(row)}</td>
                    <td className="px-1 py-1.5">{autoCell}</td>
                    <td className="px-1 py-1.5">{remove(row)}</td>
                  </tr>
                );
              }
              return (
                <tr key={row.key} className="border-b border-[var(--border)] align-top">
                  <td className="px-1 py-1.5">
                    <input
                      value={row.germ_type}
                      onChange={(e) => onPatch(row.key, { germ_type: e.target.value })}
                      placeholder={variant === "culture" ? "Bactéries Gram −" : "Bactéries Gram négatif"}
                      className={cn(CELL, "min-w-[120px]")}
                    />
                  </td>
                  <td className="px-1 py-1.5">{productSelect(row)}</td>
                  <td className="px-1 py-1.5 text-right">{qty(row)}</td>
                  {variant === "culture" ? (
                    <td className="px-1 py-1.5">
                      <input value={row.incubation} onChange={(e) => onPatch(row.key, { incubation: e.target.value })} placeholder="37 °C / 24 h" className={cn(CELL, "w-24")} />
                    </td>
                  ) : null}
                  <td className="px-1 py-1.5">{autoCell}</td>
                  <td className="px-1 py-1.5">{remove(row)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-[10px] font-semibold text-[var(--text-secondary)]">
        {label}
        {required ? <span style={{ color: "var(--critical)" }}> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function SwitchField({
  label,
  checked,
  onChange,
  on = "Oui",
  off = "Non",
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  on?: string;
  off?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
      <span className="text-[11px] font-semibold" style={{ color: checked ? "var(--good)" : "var(--text-muted)" }}>
        {checked ? on : off}
      </span>
    </div>
  );
}
