"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  Eye,
  FlaskConical,
  Plus,
  TriangleAlert,
  Users,
} from "lucide-react";
import { activateLab, assignUser, createLab } from "@/app/(app)/labs/actions";
import { DataTable, Td, Th } from "@/components/DataTable";
import type { UserRole } from "@/lib/auth";
import type { LabsWorkspaceData } from "@/lib/types";
import { formatDate, formatInt } from "@/lib/utils";

type Feedback = { message: string; ok: boolean } | null;

export function LabsWorkspace({
  data,
  currentUserId,
}: {
  data: LabsWorkspaceData;
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [newName, setNewName] = useState("");

  function run(action: () => Promise<{ status: string; message: string }>) {
    setFeedback(null);
    start(async () => {
      const result = await action();
      setFeedback({ message: result.message, ok: result.status === "success" });
      if (result.status === "success") router.refresh();
    });
  }

  function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    run(() => createLab(name));
    setNewName("");
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

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {/* Laboratoires */}
        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <FlaskConical size={14} strokeWidth={2.2} aria-hidden />
            Laboratoires
          </h2>

          <form onSubmit={submitCreate} className="mb-3 flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Nom du nouveau laboratoire"
              className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--page)] px-2.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]"
            />
            <button
              type="submit"
              disabled={pending || newName.trim() === ""}
              className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--series-1)" }}
            >
              <Plus size={13} strokeWidth={2.4} aria-hidden />
              Créer
            </button>
          </form>

          <DataTable>
            <thead>
              <tr>
                <Th>Laboratoire</Th>
                <Th align="right">Membres</Th>
                <Th>Créé le</Th>
                <Th align="right">Consultation</Th>
              </tr>
            </thead>
            <tbody>
              {data.laboratories.map((lab) => (
                <tr key={lab.id}>
                  <Td nowrap>
                    <span className="flex items-center gap-1.5 font-medium">
                      <Building2
                        size={13}
                        strokeWidth={2}
                        className="text-[var(--text-muted)]"
                        aria-hidden
                      />
                      {lab.name}
                    </span>
                  </Td>
                  <Td align="right">{formatInt(lab.member_count)}</Td>
                  <Td nowrap>{formatDate(lab.created_at)}</Td>
                  <Td align="right">
                    {lab.is_active ? (
                      <span
                        className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white"
                        style={{ background: "var(--good)" }}
                      >
                        Consulté
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => activateLab(lab.id))}
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--series-1)] hover:underline disabled:opacity-50"
                      >
                        <Eye size={12} strokeWidth={2.2} aria-hidden />
                        Consulter
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>

          <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
            Toutes les pages (tableau de bord, stock, inventaire…) affichent les
            données du laboratoire consulté.
          </p>
        </section>

        {/* Comptes */}
        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <Users size={14} strokeWidth={2.2} aria-hidden />
            Comptes et affectations
          </h2>

          <DataTable>
            <thead>
              <tr>
                <Th>Compte</Th>
                <Th>Rôle</Th>
                <Th>Laboratoire</Th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <tr key={user.id}>
                    <Td>
                      <div className="font-medium">
                        {user.full_name || user.email}
                        {isSelf ? (
                          <span className="ml-1.5 text-[9px] font-normal text-[var(--text-muted)]">
                            (vous)
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {user.email}
                      </div>
                    </Td>
                    <Td nowrap>
                      <select
                        value={user.role}
                        disabled={pending || isSelf}
                        onChange={(event) =>
                          run(() =>
                            assignUser(
                              user.id,
                              user.lab_id,
                              event.target.value as UserRole
                            )
                          )
                        }
                        className="h-7 rounded-lg border border-[var(--border)] bg-[var(--page)] px-1.5 text-[11px] text-[var(--text-primary)] disabled:opacity-60"
                      >
                        <option value="admin">Administrateur</option>
                        <option value="member">Membre</option>
                      </select>
                    </Td>
                    <Td nowrap>
                      {user.role === "admin" ? (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          Tous (via consultation)
                        </span>
                      ) : (
                        <select
                          value={user.lab_id ?? ""}
                          disabled={pending}
                          onChange={(event) =>
                            run(() =>
                              assignUser(
                                user.id,
                                event.target.value === ""
                                  ? null
                                  : Number(event.target.value),
                                user.role
                              )
                            )
                          }
                          className="h-7 rounded-lg border border-[var(--border)] bg-[var(--page)] px-1.5 text-[11px] text-[var(--text-primary)] disabled:opacity-60"
                        >
                          <option value="">— Aucun —</option>
                          {data.laboratories.map((lab) => (
                            <option key={lab.id} value={lab.id}>
                              {lab.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>

          <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
            Un membre ne voit que les données de son laboratoire. Les comptes se
            créent dans Supabase (Authentication) puis apparaissent ici pour être
            affectés.
          </p>
        </section>
      </div>
    </div>
  );
}
