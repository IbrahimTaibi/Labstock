"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Download,
  FlaskConical,
  Info,
  Loader2,
  MoreHorizontal,
  Network,
  Package,
  Plus,
  RotateCcw,
  Save,
  ScrollText,
  Settings2,
  ShieldCheck,
  Syringe,
  TestTubes,
  TriangleAlert,
  Upload,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { saveLabSettings } from "@/app/(app)/settings/actions";
import {
  DEFAULT_LAB_SETTINGS,
  mergeLabSettings,
  type LabSettings,
} from "@/lib/lab-settings";
import { cn, formatDateTime } from "@/lib/utils";

const INPUT_CLASS =
  "h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)] disabled:opacity-70";

const MAX_LOGO_BYTES = 200 * 1024;

type Feedback = { message: string; ok: boolean } | null;

/* Rubriques de la colonne de gauche : une ancre sur cette page, ou un écran
   dédié quand le paramétrage y vit déjà. */
const SECTIONS: {
  title: string;
  detail: string;
  href: string;
  Icon: typeof FlaskConical;
}[] = [
  { title: "Informations du laboratoire", detail: "Identité, coordonnées, paramètres généraux", href: "#laboratoire", Icon: FlaskConical },
  { title: "Préférences d'analyse", detail: "Unités, valeurs de référence, délais", href: "#analyse", Icon: Settings2 },
  { title: "Gestion des échantillons", detail: "Types, tubes, conditions de prélèvement", href: "#prelevements", Icon: Syringe },
  { title: "Consommables & réactifs", detail: "Modes de gestion, conditionnements", href: "/products", Icon: Package },
  { title: "Automates & méthodes", detail: "Appareils, réactifs, calibration", href: "/settings/analyses", Icon: Workflow },
  { title: "Cultures & bactériologie", detail: "Milieux, germes, antibiogrammes", href: "#cultures", Icon: TestTubes },
  { title: "Stock & déstockage", detail: "Règles FEFO, consommation auto", href: "#stock", Icon: Boxes },
  { title: "Règles & protocoles", detail: "Validation, contrôles, alertes", href: "#validation", Icon: ScrollText },
  { title: "Traçabilité & audit", detail: "Historique, journal des événements", href: "#general", Icon: ShieldCheck },
  { title: "Notifications & alertes", detail: "Seuils, emails, alarmes", href: "#notifications", Icon: Bell },
  { title: "Mon compte & référentiels", detail: "Profil, mot de passe, catégories", href: "#compte", Icon: MoreHorizontal },
];

export function LabSettingsWorkspace({
  initial,
  updatedAt,
  updatedBy,
  isAdmin,
}: {
  initial: LabSettings;
  updatedAt: string | null;
  updatedBy: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [form, setForm] = useState<LabSettings>(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [recipient, setRecipient] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(form) !== saved;
  const readOnly = !isAdmin;

  function patch<K extends keyof LabSettings>(section: K, values: Partial<LabSettings[K]>) {
    setForm((current) => ({ ...current, [section]: { ...current[section], ...values } }));
  }

  function save() {
    setFeedback(null);
    start(async () => {
      const result = await saveLabSettings(form);
      setFeedback({ ok: result.status === "success", message: result.message });
      if (result.status === "success") {
        setSaved(JSON.stringify(form));
        router.refresh();
      }
    });
  }

  function exportConfig() {
    const blob = new Blob([JSON.stringify(form, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `labstock-configuration-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importConfig(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      setForm(mergeLabSettings(parsed));
      setFeedback({
        ok: true,
        message: "Configuration importée. Vérifiez-la puis cliquez « Enregistrer » pour l'appliquer.",
      });
    } catch {
      setFeedback({ ok: false, message: "Fichier illisible : un export de configuration JSON est attendu." });
    }
  }

  function loadLogo(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setFeedback({ ok: false, message: "Logo : PNG ou JPEG uniquement." });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setFeedback({ ok: false, message: "Logo trop volumineux (200 Ko maximum)." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => patch("lab", { logo: String(reader.result) });
    reader.readAsDataURL(file);
  }

  function addRecipient() {
    const email = recipient.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFeedback({ ok: false, message: "Adresse e-mail invalide." });
      return;
    }
    if (!form.notifications.recipients.includes(email))
      patch("notifications", { recipients: [...form.notifications.recipients, email] });
    setRecipient("");
  }

  const topButton =
    "flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex flex-col gap-3">
      {/* Barre d'outils */}
      <div className="card flex flex-wrap items-center gap-2 p-2.5">
        <span className="px-1 text-[10px] text-[var(--text-muted)]">
          {updatedAt
            ? `Dernière modification le ${formatDateTime(updatedAt)}${updatedBy ? ` par ${updatedBy}` : ""}`
            : "Configuration par défaut, jamais enregistrée"}
          {dirty ? (
            <span className="ml-2 font-semibold" style={{ color: "var(--warning)" }}>
              · Modifications non enregistrées
            </span>
          ) : null}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={readOnly}
            onClick={() => importInput.current?.click()}
            className={cn(topButton, "border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--page)]")}
          >
            <Upload size={14} strokeWidth={2.2} aria-hidden />
            Importer une configuration
          </button>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              void importConfig(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={exportConfig}
            className={cn(topButton, "border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--page)]")}
          >
            <Download size={14} strokeWidth={2.2} aria-hidden />
            Exporter la configuration
          </button>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => {
              setForm({
                ...structuredClone(DEFAULT_LAB_SETTINGS),
                /* L'identité du laboratoire n'est pas une « préférence » :
                   la réinitialisation la conserve. */
                lab: form.lab,
              });
              setFeedback({
                ok: true,
                message: "Valeurs par défaut rétablies (identité conservée). Cliquez « Enregistrer » pour les appliquer.",
              });
            }}
            className={cn(topButton, "border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--page)]")}
          >
            <RotateCcw size={14} strokeWidth={2.2} aria-hidden />
            Réinitialiser
          </button>
          <button
            type="button"
            disabled={readOnly || pending || !dirty}
            onClick={save}
            title={readOnly ? "Réservé à l'administrateur" : undefined}
            className={cn(topButton, "text-white")}
            style={{ background: "var(--warning)" }}
          >
            {pending ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Save size={14} strokeWidth={2.2} aria-hidden />
            )}
            Enregistrer
          </button>
        </div>
      </div>

      {feedback ? (
        <div
          role="status"
          className="card flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium"
          style={{ color: feedback.ok ? "var(--good)" : "var(--critical)" }}
        >
          {feedback.ok ? (
            <CheckCircle2 size={14} strokeWidth={2.2} aria-hidden />
          ) : (
            <TriangleAlert size={14} strokeWidth={2.2} aria-hidden />
          )}
          {feedback.message}
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="ml-auto rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--page)]"
          >
            <X size={12} strokeWidth={2.2} aria-hidden />
            <span className="sr-only">Fermer</span>
          </button>
        </div>
      ) : null}

      {readOnly ? (
        <p className="card flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--text-secondary)]">
          <Info size={14} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
          Consultation seule : la modification des paramètres est réservée à l&apos;administrateur.
        </p>
      ) : null}

      {/* Onglets */}
      <nav className="card flex gap-1 overflow-x-auto p-1.5" aria-label="Rubriques">
        {[
          { label: "Laboratoire", href: "#laboratoire", Icon: FlaskConical, active: true },
          { label: "Analyses", href: "/settings/analyses", Icon: TestTubes },
          { label: "Consommables", href: "/products", Icon: Package },
          { label: "Automates", href: "/settings/analyses#automate", Icon: Workflow },
          { label: "Cultures & Bactériologie", href: "#cultures", Icon: TestTubes },
          { label: "Stock & Déstockage", href: "#stock", Icon: Boxes },
          { label: "Règles & Protocoles", href: "#validation", Icon: ScrollText },
          ...(isAdmin ? [{ label: "Utilisateurs & Droits", href: "/labs", Icon: Users }] : []),
          { label: "Notifications", href: "#notifications", Icon: Bell },
          { label: "Divers", href: "#compte", Icon: MoreHorizontal },
        ].map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors",
              "active" in tab && tab.active
                ? "text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--page)]"
            )}
            style={"active" in tab && tab.active ? { background: "var(--text-primary)" } : undefined}
          >
            <tab.Icon size={13} strokeWidth={2.2} aria-hidden />
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-3 xl:grid-cols-[230px_minmax(0,1fr)]">
        {/* Rubriques */}
        <nav className="card hidden h-fit flex-col p-1.5 xl:flex" aria-label="Rubriques détaillées">
          {SECTIONS.map((section, index) => (
            <Link
              key={section.title}
              href={section.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--page)]",
                index === 0 && "bg-[color-mix(in_srgb,var(--series-1)_10%,transparent)]"
              )}
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                style={{
                  color: index === 0 ? "white" : "var(--series-1)",
                  background: index === 0 ? "var(--series-1)" : "color-mix(in srgb, var(--series-1) 10%, transparent)",
                }}
              >
                <section.Icon size={15} strokeWidth={2.2} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-semibold text-[var(--text-primary)]">
                  {section.title}
                </span>
                <span className="block truncate text-[9px] text-[var(--text-muted)]">{section.detail}</span>
              </span>
              <ChevronRight size={13} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
            </Link>
          ))}
        </nav>

        <fieldset disabled={readOnly} className="min-w-0 space-y-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
            {/* 1. Laboratoire */}
            <Card id="laboratoire" icon={<FlaskConical size={16} strokeWidth={2.2} aria-hidden />} title="1. Informations générales du laboratoire">
              <div className="grid gap-4 md:grid-cols-[140px_minmax(0,1fr)]">
                <div className="flex flex-col items-center gap-2">
                  <div className="grid h-[110px] w-[110px] place-items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--page)]">
                    {form.lab.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data URL locale
                      <img src={form.lab.logo} alt="Logo du laboratoire" className="h-full w-full object-contain" />
                    ) : (
                      <FlaskConical size={44} strokeWidth={1.4} className="text-[var(--series-1)]" aria-hidden />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => logoInput.current?.click()}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-[10px] font-semibold text-[var(--text-primary)] hover:bg-[var(--page)]"
                  >
                    <Upload size={12} strokeWidth={2.2} aria-hidden />
                    Modifier le logo
                  </button>
                  {form.lab.logo ? (
                    <button
                      type="button"
                      onClick={() => patch("lab", { logo: null })}
                      className="text-[10px] text-[var(--text-muted)] hover:text-[var(--critical)]"
                    >
                      Retirer
                    </button>
                  ) : null}
                  <input
                    ref={logoInput}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(event) => {
                      loadLogo(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Nom du laboratoire" required>
                    <input value={form.lab.name} onChange={(e) => patch("lab", { name: e.target.value })} className={INPUT_CLASS} />
                  </Field>
                  <Field label="Code établissement">
                    <input value={form.lab.code} onChange={(e) => patch("lab", { code: e.target.value })} placeholder="LC-001" className={INPUT_CLASS} />
                  </Field>
                  <Field label="Responsable">
                    <input value={form.lab.manager} onChange={(e) => patch("lab", { manager: e.target.value })} placeholder="Dr. …" className={INPUT_CLASS} />
                  </Field>
                  <Field label="Adresse" className="sm:col-span-3">
                    <input value={form.lab.address} onChange={(e) => patch("lab", { address: e.target.value })} placeholder="12 Avenue de la Santé, Tunis" className={INPUT_CLASS} />
                  </Field>
                  <Field label="Téléphone">
                    <input value={form.lab.phone} onChange={(e) => patch("lab", { phone: e.target.value })} placeholder="+216 71 123 456" className={INPUT_CLASS} />
                  </Field>
                  <Field label="E-mail">
                    <input type="email" value={form.lab.email} onChange={(e) => patch("lab", { email: e.target.value })} placeholder="contact@laboratoire.tn" className={INPUT_CLASS} />
                  </Field>
                  <Field label="Site web">
                    <input value={form.lab.website} onChange={(e) => patch("lab", { website: e.target.value })} placeholder="www.laboratoire.tn" className={INPUT_CLASS} />
                  </Field>
                </div>
              </div>
            </Card>

            {/* Paramètres généraux */}
            <section id="general" className="card scroll-mt-4 p-4">
              <h2 className="mb-2 text-[12px] font-bold text-[var(--text-primary)]">Paramètres généraux</h2>
              <div className="divide-y divide-[var(--border)]">
                <ToggleRow label="Gestion des lots" checked={form.general.lots} onChange={(v) => patch("general", { lots: v })} />
                <ToggleRow label="Traçabilité complète" checked={form.general.full_traceability} onChange={(v) => patch("general", { full_traceability: v })} />
                <ToggleRow label="Déstockage automatique" checked={form.general.auto_destock} onChange={(v) => patch("general", { auto_destock: v })} />
                <ToggleRow label="Validation biologique requise" checked={form.general.bio_validation_required} onChange={(v) => patch("general", { bio_validation_required: v })} />
                <ToggleRow label="Mode multi-sites" checked={form.general.multi_site} onChange={(v) => patch("general", { multi_site: v })} />
              </div>
              <Field label="Langue de l'interface" className="mt-2">
                <select value={form.general.language} onChange={(e) => patch("general", { language: e.target.value })} className={INPUT_CLASS}>
                  <option>Français</option>
                </select>
              </Field>
            </section>
          </div>

          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {/* 2. Analyse */}
            <Card id="analyse" icon={<Settings2 size={16} strokeWidth={2.2} aria-hidden />} title="2. Paramètres d'analyse">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Unité de base">
                  <select value={form.analysis.unit_system} onChange={(e) => patch("analysis", { unit_system: e.target.value })} className={INPUT_CLASS}>
                    {withCurrent(["Système international (SI)", "Unités conventionnelles"], form.analysis.unit_system).map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Arrondi des résultats">
                  <select value={form.analysis.rounding} onChange={(e) => patch("analysis", { rounding: e.target.value })} className={INPUT_CLASS}>
                    {withCurrent(["Selon méthode", "1 décimale", "2 décimales", "Entier"], form.analysis.rounding).map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Délai par défaut">
                  <Unit unit="heures">
                    <input type="number" min={0} value={form.analysis.default_turnaround_hours} onChange={(e) => patch("analysis", { default_turnaround_hours: toInt(e.target.value) })} className={cn(INPUT_CLASS, "tnum pr-14")} />
                  </Unit>
                </Field>
                <Field label="Type d'échantillon par défaut">
                  <select value={form.analysis.default_sample_type} onChange={(e) => patch("analysis", { default_sample_type: e.target.value })} className={INPUT_CLASS}>
                    {withCurrent(["Sérum", "Plasma", "Sang total", "Urines", "Selles", "LCR", "Écouvillon"], form.analysis.default_sample_type).map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Field>
              </div>
            </Card>

            {/* 3. Prélèvements */}
            <Card id="prelevements" icon={<Syringe size={16} strokeWidth={2.2} aria-hidden />} title="3. Gestion des prélèvements">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type de prélèvement">
                  <select value={form.sampling.sample_type} onChange={(e) => patch("sampling", { sample_type: e.target.value })} className={INPUT_CLASS}>
                    {withCurrent(["Sang veineux", "Sang capillaire", "Urines", "Selles", "Écouvillon"], form.sampling.sample_type).map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Tube par défaut">
                  <select value={form.sampling.tube} onChange={(e) => patch("sampling", { tube: e.target.value })} className={INPUT_CLASS}>
                    {withCurrent(["Tube sec (Sérum)", "Tube EDTA", "Tube citraté", "Tube hépariné", "Tube fluoré", "Flacon stérile"], form.sampling.tube).map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Volume standard">
                  <Unit unit="mL">
                    <input type="number" min={0} step={0.5} value={form.sampling.volume_ml} onChange={(e) => patch("sampling", { volume_ml: toNumber(e.target.value) })} className={cn(INPUT_CLASS, "tnum pr-10")} />
                  </Unit>
                </Field>
                <Field label="Conditions de transport">
                  <select value={form.sampling.transport} onChange={(e) => patch("sampling", { transport: e.target.value })} className={INPUT_CLASS}>
                    {withCurrent(["Température ambiante", "Réfrigéré (2–8 °C)", "Congelé", "À l'abri de la lumière"], form.sampling.transport).map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Field>
              </div>
            </Card>

            {/* 4. Cultures */}
            <Card id="cultures" icon={<TestTubes size={16} strokeWidth={2.2} aria-hidden />} title="4. Gestion des cultures">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Milieu par défaut">
                  <select value={form.cultures.default_medium} onChange={(e) => patch("cultures", { default_medium: e.target.value })} className={INPUT_CLASS}>
                    {withCurrent(["Gélose nutritive", "Gélose au sang", "Milieu CLED", "Milieu Chapman", "Gélose chocolat"], form.cultures.default_medium).map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Durée d'incubation (standard)">
                  <Unit unit="heures">
                    <input type="number" min={0} value={form.cultures.incubation_hours} onChange={(e) => patch("cultures", { incubation_hours: toInt(e.target.value) })} className={cn(INPUT_CLASS, "tnum pr-14")} />
                  </Unit>
                </Field>
              </div>
              <div className="mt-2 divide-y divide-[var(--border)]">
                <ToggleRow label="Lecture automatique" checked={form.cultures.auto_reading} onChange={(v) => patch("cultures", { auto_reading: v })} />
                <ToggleRow label="Alerte culture positive" checked={form.cultures.positive_alert} onChange={(v) => patch("cultures", { positive_alert: v })} />
              </div>
            </Card>

            {/* 5. Stock */}
            <Card id="stock" icon={<Boxes size={16} strokeWidth={2.2} aria-hidden />} title="5. Gestion du stock">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Méthode de déstockage">
                  <select value={form.stock.method} onChange={(e) => patch("stock", { method: e.target.value as "FEFO" | "FIFO" })} className={INPUT_CLASS}>
                    <option value="FEFO">FEFO (premier expiré, premier sorti)</option>
                    <option value="FIFO">FIFO (premier entré, premier sorti)</option>
                  </select>
                </Field>
                <Field label="Seuil d'alerte rupture">
                  <Unit unit="jours">
                    <input type="number" min={0} value={form.stock.stockout_alert_days} onChange={(e) => patch("stock", { stockout_alert_days: toInt(e.target.value) })} className={cn(INPUT_CLASS, "tnum pr-12")} />
                  </Unit>
                </Field>
                <Field label="Stock minimum">
                  <select value={form.stock.min_stock_mode} onChange={(e) => patch("stock", { min_stock_mode: e.target.value })} className={INPUT_CLASS}>
                    {withCurrent(["Par article", "Par catégorie"], form.stock.min_stock_mode).map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Gestion des milieux de culture">
                  <select value={form.stock.culture_media_mode} onChange={(e) => patch("stock", { culture_media_mode: e.target.value })} className={INPUT_CLASS}>
                    {withCurrent(["Selon configuration", "Déstockage automatique", "Sortie manuelle"], form.stock.culture_media_mode).map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Field>
              </div>
              {form.stock.method === "FIFO" ? (
                <p className="mt-2 flex items-start gap-1.5 text-[10px]" style={{ color: "var(--warning)" }}>
                  <TriangleAlert size={12} strokeWidth={2.4} className="mt-px shrink-0" aria-hidden />
                  Le déstockage automatique sort aujourd&apos;hui toujours en FEFO : ce choix est enregistré mais pas encore appliqué.
                </p>
              ) : null}
            </Card>

            {/* 6. Validation */}
            <Card id="validation" icon={<ShieldCheck size={16} strokeWidth={2.2} aria-hidden />} title="6. Règles de validation">
              <div className="divide-y divide-[var(--border)]">
                <ToggleRow label="Contrôle microscopique" checked={form.validation.microscopy_control} onChange={(v) => patch("validation", { microscopy_control: v })} />
                <ToggleRow label="Delta check" checked={form.validation.delta_check} onChange={(v) => patch("validation", { delta_check: v })} />
                <ToggleRow label="Valeurs critiques" checked={form.validation.critical_values} onChange={(v) => patch("validation", { critical_values: v })} />
                <div className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[11px] text-[var(--text-primary)]">Répétition automatique</span>
                  <select value={form.validation.auto_repeat} onChange={(e) => patch("validation", { auto_repeat: e.target.value })} className={cn(INPUT_CLASS, "h-8 w-[140px] text-[11px]")}>
                    {withCurrent(["Selon la règle", "Toujours", "Jamais"], form.validation.auto_repeat).map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <ToggleRow label="Dilution automatique" checked={form.validation.auto_dilution} onChange={(v) => patch("validation", { auto_dilution: v })} />
              </div>
            </Card>

            {/* 7. Notifications */}
            <Card id="notifications" icon={<Bell size={16} strokeWidth={2.2} aria-hidden />} title="7. Notifications & alertes">
              <div className="divide-y divide-[var(--border)]">
                <ToggleRow label="Alerte stock faible" checked={form.notifications.low_stock} onChange={(v) => patch("notifications", { low_stock: v })} />
                <ToggleRow label="Alerte péremption" checked={form.notifications.expiry} onChange={(v) => patch("notifications", { expiry: v })} />
                <ToggleRow label="Culture positive" checked={form.notifications.positive_culture} onChange={(v) => patch("notifications", { positive_culture: v })} />
                <ToggleRow label="Envoi par e-mail" checked={form.notifications.email} onChange={(v) => patch("notifications", { email: v })} />
              </div>
              <Field label="Destinataires" className="mt-2">
                <div className="flex gap-1.5">
                  <input
                    type="email"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addRecipient();
                      }
                    }}
                    placeholder="biologiste@laboratoire.tn"
                    className={INPUT_CLASS}
                  />
                  <button
                    type="button"
                    onClick={addRecipient}
                    aria-label="Ajouter le destinataire"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white"
                    style={{ background: "var(--series-1)" }}
                  >
                    <Plus size={15} strokeWidth={2.4} aria-hidden />
                  </button>
                </div>
              </Field>
              {form.notifications.recipients.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {form.notifications.recipients.map((email) => (
                    <li
                      key={email}
                      className="flex items-center gap-1 rounded-full bg-[var(--page)] py-0.5 pl-2.5 pr-1 text-[10px] text-[var(--text-primary)]"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() =>
                          patch("notifications", {
                            recipients: form.notifications.recipients.filter((r) => r !== email),
                          })
                        }
                        aria-label={`Retirer ${email}`}
                        className="grid h-4 w-4 place-items-center rounded-full hover:bg-[var(--surface)]"
                      >
                        <X size={10} strokeWidth={2.4} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          </div>

          <p
            className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[11px] text-[var(--text-secondary)]"
            style={{ background: "color-mix(in srgb, var(--series-1) 8%, transparent)" }}
          >
            <Info size={14} strokeWidth={2.2} className="mt-px shrink-0" style={{ color: "var(--series-1)" }} aria-hidden />
            Ces paramètres sont essentiels pour assurer la conformité de votre laboratoire avec la norme
            ISO 15189:2022 et garantir une gestion optimale des analyses, des stocks et de la traçabilité.
          </p>
        </fieldset>
      </div>

      <div className="flex items-center gap-2 pt-1 text-[10px] text-[var(--text-muted)]">
        <Network size={12} aria-hidden />
        La connexion au logiciel de laboratoire (LIS) se règle par source, côté intégrations.
      </div>
    </div>
  );
}

function withCurrent(options: string[], value: string) {
  return value && !options.includes(value) ? [value, ...options] : options;
}

function toInt(raw: string) {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toNumber(raw: string) {
  const n = Number.parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function Card({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card scroll-mt-4 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-[12px] font-bold text-[var(--text-primary)]">
        <span style={{ color: "var(--series-1)" }}>{icon}</span>
        {title}
      </h2>
      {children}
    </section>
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

function Unit({ unit, children }: { unit: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)]">
        {unit}
      </span>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-[11px] text-[var(--text-primary)]">{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-60"
      style={{ background: checked ? "var(--text-primary)" : "var(--border)" }}
    >
      <span
        className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]"
        style={{ left: checked ? 18 : 2 }}
      />
    </button>
  );
}
