"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  FlaskConical,
  KeyRound,
  Pencil,
  Plus,
  Tags,
  Trash2,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import {
  changePassword,
  deleteCategory,
  renameLab,
  saveCategory,
  updateProfile,
} from "@/app/(app)/settings/actions";
import type { SettingsState } from "@/app/(app)/settings/actions";
import type { CurrentUser } from "@/lib/auth";
import type { SettingsWorkspaceData } from "@/lib/types";
import { cn, formatInt } from "@/lib/utils";

const INPUT_CLASS =
  "h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--page)] px-2.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]";

type Feedback = { message: string; ok: boolean } | null;

function SectionTitle({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
      {icon}
      {children}
    </h2>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function SubmitButton({
  disabled,
  children,
}: {
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-white disabled:opacity-50"
      style={{ background: "var(--series-1)" }}
    >
      {children}
    </button>
  );
}

export function SettingsWorkspace({
  user,
  data,
}: {
  user: CurrentUser;
  data: SettingsWorkspaceData;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [fullName, setFullName] = useState(user.fullName);
  const [jobTitle, setJobTitle] = useState(user.jobTitle);

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const [newCategory, setNewCategory] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [labName, setLabName] = useState(user.labName ?? "");

  function run(action: () => Promise<SettingsState>) {
    setFeedback(null);
    start(async () => {
      const result = await action();
      setFeedback({ message: result.message, ok: result.status === "success" });
      if (result.status === "success") router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
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
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
        <div className="flex flex-col gap-3">
          {/* Profil */}
          <section className="card p-4">
            <SectionTitle
              icon={<UserRound size={14} strokeWidth={2.2} aria-hidden />}
            >
              Profil
            </SectionTitle>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                run(() => updateProfile(fullName, jobTitle));
              }}
              className="flex flex-col gap-2.5"
            >
              <Field label="Adresse e-mail">
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className={cn(INPUT_CLASS, "opacity-60")}
                />
              </Field>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Nom complet *">
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </Field>
                <Field label="Fonction">
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Technicien de laboratoire"
                    className={INPUT_CLASS}
                  />
                </Field>
              </div>
              <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                Le nom complet identifie l&apos;opérateur sur les réceptions,
                sorties et comptages.
              </p>
              <SubmitButton disabled={pending || fullName.trim() === ""}>
                <Check size={13} strokeWidth={2.4} aria-hidden />
                Enregistrer le profil
              </SubmitButton>
            </form>
          </section>

          {/* Sécurité */}
          <section className="card p-4">
            <SectionTitle
              icon={<KeyRound size={14} strokeWidth={2.2} aria-hidden />}
            >
              Sécurité
            </SectionTitle>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  const result = await changePassword(password, confirmation);
                  if (result.status === "success") {
                    setPassword("");
                    setConfirmation("");
                  }
                  return result;
                });
              }}
              className="flex flex-col gap-2.5"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Nouveau mot de passe *">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className={INPUT_CLASS}
                  />
                </Field>
                <Field label="Confirmation *">
                  <input
                    type="password"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    autoComplete="new-password"
                    className={INPUT_CLASS}
                  />
                </Field>
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">
                Au moins 8 caractères.
              </p>
              <SubmitButton
                disabled={
                  pending || password.length < 8 || password !== confirmation
                }
              >
                <KeyRound size={13} strokeWidth={2.4} aria-hidden />
                Changer le mot de passe
              </SubmitButton>
            </form>
          </section>

          {/* Laboratoire (admin) */}
          {user.role === "admin" ? (
            <section className="card p-4">
              <SectionTitle
                icon={<FlaskConical size={14} strokeWidth={2.2} aria-hidden />}
              >
                Laboratoire consulté
              </SectionTitle>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  run(() => renameLab(labName));
                }}
                className="flex items-end gap-2"
              >
                <div className="min-w-0 flex-1">
                  <Field label="Nom du laboratoire *">
                    <input
                      type="text"
                      value={labName}
                      onChange={(e) => setLabName(e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </Field>
                </div>
                <SubmitButton disabled={pending || labName.trim() === ""}>
                  <Check size={13} strokeWidth={2.4} aria-hidden />
                  Renommer
                </SubmitButton>
              </form>
              <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                La création de laboratoires et l&apos;affectation des comptes se
                font depuis la page Laboratoires.
              </p>
            </section>
          ) : null}
        </div>

        {/* Catégories */}
        <section className="card p-4">
          <SectionTitle icon={<Tags size={14} strokeWidth={2.2} aria-hidden />}>
            Catégories de produits
            <span className="font-normal normal-case tracking-normal text-[var(--text-muted)]">
              ({formatInt(data.categories.length)})
            </span>
          </SectionTitle>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!newCategory.trim()) return;
              run(() => saveCategory(null, newCategory));
              setNewCategory("");
            }}
            className="mb-3 flex gap-2"
          >
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Nouvelle catégorie"
              className={INPUT_CLASS}
            />
            <button
              type="submit"
              disabled={pending || newCategory.trim() === ""}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--series-1)" }}
            >
              <Plus size={13} strokeWidth={2.4} aria-hidden />
              Ajouter
            </button>
          </form>

          <ul className="flex flex-col">
            {data.categories.map((category) => {
              const editing = editingId === category.id;
              const confirming = confirmDeleteId === category.id;
              return (
                <li
                  key={category.id}
                  className="flex items-center gap-2 border-b border-[var(--border)] py-1.5 last:border-b-0"
                >
                  {editing ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!editingName.trim()) return;
                        run(() => saveCategory(category.id, editingName));
                        setEditingId(null);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2"
                    >
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        autoFocus
                        className={INPUT_CLASS}
                      />
                      <button
                        type="submit"
                        disabled={pending || editingName.trim() === ""}
                        className="rounded p-1 text-[var(--series-1)] hover:bg-[var(--page)] disabled:opacity-50"
                      >
                        <Check size={14} strokeWidth={2.4} aria-hidden />
                        <span className="sr-only">Valider</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--page)]"
                      >
                        <X size={14} strokeWidth={2.2} aria-hidden />
                        <span className="sr-only">Annuler</span>
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--text-primary)]">
                        {category.name}
                      </span>
                      <span className="tnum shrink-0 text-[10px] text-[var(--text-muted)]">
                        {formatInt(category.products)} produit
                        {category.products > 1 ? "s" : ""}
                      </span>
                      {confirming ? (
                        <span className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              setConfirmDeleteId(null);
                              run(() => deleteCategory(category.id));
                            }}
                            className="text-[10px] font-semibold disabled:opacity-50"
                            style={{ color: "var(--critical)" }}
                          >
                            Confirmer ?
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-[10px] text-[var(--text-muted)] hover:underline"
                          >
                            Non
                          </button>
                        </span>
                      ) : (
                        <span className="flex shrink-0 items-center">
                          <button
                            type="button"
                            title="Renommer"
                            onClick={() => {
                              setEditingId(category.id);
                              setEditingName(category.name);
                              setConfirmDeleteId(null);
                            }}
                            className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--series-1)]"
                          >
                            <Pencil size={12} strokeWidth={2.2} aria-hidden />
                            <span className="sr-only">
                              Renommer {category.name}
                            </span>
                          </button>
                          <button
                            type="button"
                            title={
                              category.products > 0
                                ? "Utilisée par des produits : suppression impossible"
                                : "Supprimer"
                            }
                            disabled={category.products > 0}
                            onClick={() => setConfirmDeleteId(category.id)}
                            className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--critical)] disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Trash2 size={12} strokeWidth={2.2} aria-hidden />
                            <span className="sr-only">
                              Supprimer {category.name}
                            </span>
                          </button>
                        </span>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
            Les catégories organisent le stock, les inventaires par périmètre et
            les graphiques du tableau de bord. Une catégorie utilisée par des
            produits ne peut pas être supprimée.
          </p>
        </section>
      </div>
    </div>
  );
}
