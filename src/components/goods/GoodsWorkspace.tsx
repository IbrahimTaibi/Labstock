"use client";

import { useEffect, useRef, useState } from "react";
import { NEW_LOT_EVENT } from "./GoodsHeaderActions";
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

  /* « Nouvelle marchandise » depuis l'en-tête : on repart d'un formulaire
     vierge et on y amène l'utilisateur. */
  useEffect(() => {
    function onNewLot() {
      setEditingId(null);
      setSelectedId(null);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.addEventListener(NEW_LOT_EVENT, onNewLot);
    return () => window.removeEventListener(NEW_LOT_EVENT, onNewLot);
  }, []);

  /* §7.1 : sélectionner une ligne alimente en même temps la fiche de droite
     et le formulaire du haut, qui bascule en modification. */
  function select(lot: Lot) {
    setSelectedId(lot.id);
    setEditingId(lot.id);
  }

  /* Le bouton crayon fait la même chose, en amenant l'œil au formulaire —
     remonter la page à chaque clic de ligne serait insupportable. */
  function startEdit(lot: Lot) {
    select(lot);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_310px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div ref={formRef} id="lot-form">
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
          onSelect={select}
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
