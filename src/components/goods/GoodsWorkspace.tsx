"use client";

import { useRef, useState } from "react";
import { LotDetails } from "./LotDetails";
import { LotForm } from "./LotForm";
import { LotTable } from "./LotTable";
import type { Lot, ProductOption } from "@/lib/types";

export function GoodsWorkspace({
  lots,
  products,
}: {
  lots: Lot[];
  products: ProductOption[];
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  /* Sélection dérivée : si le lot disparaît côté serveur, le panneau se vide
     de lui-même, sans état à resynchroniser. */
  const selected = lots.find((lot) => lot.id === selectedId) ?? null;
  const editing = lots.find((lot) => lot.id === editingId) ?? null;

  function startEdit(lot: Lot) {
    setEditingId(lot.id);
    setSelectedId(lot.id);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_310px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div ref={formRef}>
          <LotForm
            lots={lots}
            products={products}
            selected={editing}
            onCancel={() => setEditingId(null)}
          />
        </div>

        <LotTable
          lots={lots}
          selectedId={selectedId}
          onSelect={(lot) => setSelectedId(lot.id)}
          onEdit={startEdit}
        />
      </div>

      <LotDetails
        lot={selected}
        onClose={() => setSelectedId(null)}
        onEdit={startEdit}
      />
    </div>
  );
}
