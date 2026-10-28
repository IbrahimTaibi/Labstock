/* Document de configuration d'un laboratoire (table `lab_settings`).
   Module sans dépendance serveur : l'écran, l'import et la
   réinitialisation partagent les mêmes valeurs par défaut. */

export type LabSettings = {
  lab: {
    name: string;
    code: string;
    manager: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    /** Logo en data URL (PNG/JPEG, 200 Ko max). */
    logo: string | null;
  };
  analysis: {
    unit_system: string;
    rounding: string;
    default_turnaround_hours: number;
    default_sample_type: string;
  };
  sampling: {
    sample_type: string;
    tube: string;
    volume_ml: number;
    transport: string;
  };
  cultures: {
    default_medium: string;
    incubation_hours: number;
    auto_reading: boolean;
    positive_alert: boolean;
  };
  stock: {
    method: "FEFO" | "FIFO";
    stockout_alert_days: number;
    min_stock_mode: string;
    culture_media_mode: string;
  };
  validation: {
    microscopy_control: boolean;
    delta_check: boolean;
    critical_values: boolean;
    auto_repeat: string;
    auto_dilution: boolean;
  };
  notifications: {
    low_stock: boolean;
    expiry: boolean;
    positive_culture: boolean;
    email: boolean;
    recipients: string[];
  };
  general: {
    lots: boolean;
    full_traceability: boolean;
    auto_destock: boolean;
    bio_validation_required: boolean;
    multi_site: boolean;
    language: string;
  };
};

export const DEFAULT_LAB_SETTINGS: LabSettings = {
  lab: {
    name: "",
    code: "",
    manager: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    logo: null,
  },
  analysis: {
    unit_system: "Système international (SI)",
    rounding: "Selon méthode",
    default_turnaround_hours: 24,
    default_sample_type: "Sérum",
  },
  sampling: {
    sample_type: "Sang veineux",
    tube: "Tube sec (Sérum)",
    volume_ml: 5,
    transport: "Température ambiante",
  },
  cultures: {
    default_medium: "Gélose nutritive",
    incubation_hours: 24,
    auto_reading: true,
    positive_alert: true,
  },
  stock: {
    method: "FEFO",
    stockout_alert_days: 3,
    min_stock_mode: "Par article",
    culture_media_mode: "Selon configuration",
  },
  validation: {
    microscopy_control: true,
    delta_check: true,
    critical_values: true,
    auto_repeat: "Selon la règle",
    auto_dilution: false,
  },
  notifications: {
    low_stock: true,
    expiry: true,
    positive_culture: true,
    email: true,
    recipients: [],
  },
  general: {
    lots: true,
    full_traceability: true,
    auto_destock: true,
    bio_validation_required: true,
    multi_site: false,
    language: "Français",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Superpose un document stocké (ou importé) aux valeurs par défaut, rubrique
 * par rubrique, en ne gardant que les clés connues au type attendu. Un
 * fichier d'import d'une autre version, ou trafiqué, ne peut donc ni
 * introduire de clé inconnue ni casser le typage de l'écran.
 */
export function mergeLabSettings(stored: unknown): LabSettings {
  const result = structuredClone(DEFAULT_LAB_SETTINGS);
  if (!isRecord(stored)) return result;

  for (const section of Object.keys(result) as (keyof LabSettings)[]) {
    const source = stored[section];
    if (!isRecord(source)) continue;
    const target = result[section] as Record<string, unknown>;
    for (const key of Object.keys(target)) {
      const value = source[key];
      const expected = target[key];
      if (key === "logo") {
        if (value === null || (typeof value === "string" && value.startsWith("data:image/")))
          target[key] = value;
      } else if (Array.isArray(expected)) {
        if (Array.isArray(value)) target[key] = value.filter((v) => typeof v === "string");
      } else if (typeof value === typeof expected) {
        target[key] = value;
      }
    }
  }
  if (result.stock.method !== "FEFO" && result.stock.method !== "FIFO") result.stock.method = "FEFO";
  return result;
}
