export type Laboratory = {
  id: number;
  name: string;
  created_at: string;
  member_count: number;
  is_active: boolean;
};

export type LabUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "member";
  lab_id: number | null;
};

export type LabsWorkspaceData = {
  laboratories: Laboratory[];
  users: LabUser[];
};

export type SupplierProfile = {
  id: number;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

export type SupplierProduct = {
  id: number;
  supplier_id: number;
  name: string;
  reference: string | null;
  category: string;
  stock_qty: number;
  min_stock: number;
  unit_price: number;
};

export type SupplierOrder = {
  id: number;
  supplier_id: number;
  number: string;
  ordered_at: string;
  status: DeliveryStatus;
  lines: number;
  total: number;
};

export type SupplierInvoice = {
  id: number;
  supplier_id: number;
  number: string;
  amount: number;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  payment_date: string | null;
};

export type SupplierRow = SupplierProfile & {
  products: number;
  stock_value: number;
  open_orders: number;
  invoice_count: number;
  invoiced_total: number;
  pending_amount: number;
  overdue_count: number;
  overdue_amount: number;
  last_invoice_date: string | null;
  /** Part du total facturé du laboratoire (0–1). */
  share: number;
};

export type SuppliersWorkspaceData = {
  suppliers: SupplierRow[];
  products: SupplierProduct[];
  orders: SupplierOrder[];
  /** Factures récentes par fournisseur (20 max) ; les totaux couvrent tout. */
  invoices: SupplierInvoice[];
  totals: {
    invoiced: number;
    pending: number;
    overdue: number;
    overdue_count: number;
  };
};

export type ProductStockState = "ok" | "low" | "out";

export type ProductRow = {
  id: number;
  name: string;
  reference: string | null;
  /** Référence affichée : la vraie, sinon le repli REF-000123. */
  display_reference: string;
  category_id: number;
  category: string;
  supplier_id: number;
  supplier: string;
  unit_price: number;
  stock_qty: number;
  min_stock: number;
  stock_value: number;
  state: ProductStockState;
  created_at: string;
};

export type ProductLot = {
  id: number;
  product_id: number;
  lot_number: string;
  expiry_date: string;
  current_qty: number;
  is_expired: boolean;
};

export type ProductsWorkspaceData = {
  products: ProductRow[];
  /** Lots encore détenus, pour le détail par produit. */
  lots: ProductLot[];
  categories: { id: number; name: string }[];
  suppliers: { id: number; name: string }[];
  totals: {
    count: number;
    stock_value: number;
    ok_count: number;
    low_count: number;
    out_count: number;
  };
};

export type CategoryRow = {
  id: number;
  name: string;
  /** Nombre de produits rattachés ; une catégorie utilisée ne se supprime pas. */
  products: number;
};

export type SettingsWorkspaceData = {
  categories: CategoryRow[];
};

export type InvoiceRow = {
  id: number;
  number: string;
  supplier_id: number;
  supplier: string;
  amount: number;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  payment_date: string | null;
  /** Jours de retard d'une facture non payée échue ; 0 sinon. */
  days_late: number;
};

export type InvoiceDocumentLine = {
  id: number;
  description: string;
  quantity: number;
  unit_price: number;
};

/** Facture prête à imprimer : en-tête, émetteur, lignes. */
export type InvoiceDocument = {
  number: string;
  amount: number;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  payment_date: string | null;
  supplier: {
    name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  lines: InvoiceDocumentLine[];
};

export type InvoicesWorkspaceData = {
  invoices: InvoiceRow[];
  suppliers: { id: number; name: string }[];
  /** Catalogue pour composer les lignes d'une nouvelle facture. */
  products: { id: number; name: string; supplier_id: number; unit_price: number }[];
  totals: {
    invoiced: number;
    paid_count: number;
    paid_amount: number;
    pending_count: number;
    pending_amount: number;
    overdue_count: number;
    overdue_amount: number;
  };
};

export type KpiPoint = {
  month: string;
  skus: number;
  units: number;
  value: number;
  below_min: number;
  out_of_stock: number;
  to_reorder: number;
};

export type CategoryStock = {
  category: string;
  products: number;
  units: number;
  value: number;
};

export type InvoiceStatus = "paid" | "pending" | "overdue";

/* ------------------------------------------------------------------ Dettes */

/** Tranches d'ancienneté : miroir exact de public.debt_ageing_bucket(). */
export type DebtStatus =
  | "paid"
  | "not_due"
  | "no_due_date"
  | "late_1_30"
  | "late_31_60"
  | "late_61_90"
  | "late_90_plus";

export type DebtSource = "supplier" | "subcontractor";

export type PaymentMethod = "transfer" | "check" | "cash" | "card" | "other";

export type DebtRow = {
  source: DebtSource;
  invoice_id: number;
  number: string;
  external_number: string | null;
  creditor: string;
  creditor_id: number;
  issue_date: string;
  due_date: string | null;
  payment_terms_days: number | null;
  expense_category: string | null;
  amount_due: number;
  amount_paid: number;
  balance: number;
  days_late: number | null;
  status: DebtStatus;
};

export type PaymentRow = {
  payment_id: number;
  paid_at: string;
  source: DebtSource;
  invoice_id: number;
  invoice_number: string;
  creditor: string;
  method: PaymentMethod;
  reference: string | null;
  amount: number;
  note: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
};

/** Les 5 cartes KPI, partagées par les deux écrans du parcours. */
export type DebtTotals = {
  count: number;
  amount_due: number;
  amount_paid: number;
  balance: number;
  overdue_count: number;
  overdue_over_30: number;
};

export type DebtAgeingSlice = {
  status: DebtStatus;
  count: number;
  balance: number;
};

export type DebtCreditorTotal = {
  creditor: string;
  balance: number;
  invoices: number;
};

export type DebtsWorkspaceData = {
  debts: DebtRow[];
  payments: PaymentRow[];
  totals: DebtTotals;
  ageing: DebtAgeingSlice[];
  topCreditors: DebtCreditorTotal[];
};

/* -------------------------------------------------- Bons de commande (B.C.) */

/** Cycle de vie fournisseur — distinct de `DeliveryStatus` (réception). */
export type OrderLifecycle = "draft" | "approved" | "sent" | "cancelled";

export type PurchaseOrderRow = {
  id: number;
  number: string;
  supplier_id: number;
  supplier: string | null;
  order_date: string;
  lifecycle: OrderLifecycle;
  status: DeliveryStatus;
  delivery_days: number | null;
  payment_method: string | null;
  currency: string;
  validated_at: string | null;
  validated_by: string | null;
  sent_at: string | null;
  sent_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  line_count: number;
  total_quantity: number;
  total_ht: number;
  total_vat: number;
  total_ttc: number;
};

export type OrderCartLine = {
  id: number;
  product_id: number;
  product_name: string;
  reference: string | null;
  request_id: number | null;
  request_number: string | null;
  requester: string | null;
  quantity_ordered: number;
  quantity_received: number;
  unit_price: number;
  vat_rate: number;
  line_total_ht: number;
  line_vat: number;
};

/** D.A. validée et libre, prête à rejoindre un panier (§5). */
export type AvailableRequest = {
  id: number;
  number: string;
  requested_at: string;
  product_id: number;
  reference: string | null;
  designation: string;
  supplier_id: number;
  quantity: number;
  requester: string;
};

export type OrdersWorkspaceData = {
  current: PurchaseOrderRow | null;
  lines: OrderCartLine[];
  available: AvailableRequest[];
  recent: PurchaseOrderRow[];
  suppliers: { id: number; name: string }[];
  products: {
    id: number;
    name: string;
    reference: string | null;
    supplier_id: number;
    unit_price: number;
  }[];
};

/* ------------------------------------------------- Demandes d'achat (D.A.) */

export type RequestStatus = "pending" | "approved" | "rejected" | "converted";

export type RequestPriority = "critical" | "urgent" | "normal";

export type RequestEventKind =
  | "created"
  | "approved"
  | "rejected"
  | "converted"
  | "updated";

export type PurchaseRequestRow = {
  id: number;
  number: string;
  requested_at: string;
  product_id: number | null;
  reference: string | null;
  designation: string;
  supplier_id: number | null;
  supplier: string | null;
  quantity_requested: number;
  quantity_approved: number | null;
  estimated_unit_price: number | null;
  priority: RequestPriority;
  status: RequestStatus;
  requester: string;
  comment: string | null;
  validated_at: string | null;
  validated_by: string | null;
  rejection_reason: string | null;
  purchase_order_id: number | null;
  purchase_order_number: string | null;
};

export type PurchaseRequestEvent = {
  id: number;
  request_id: number;
  kind: RequestEventKind;
  occurred_at: string;
  actor: string | null;
  detail: string | null;
};

/** Les 6 cartes de §3. */
export type RequestTotals = {
  total: number;
  pending: number;
  approved: number;
  converted: number;
  rejected: number;
  critical: number;
  this_month: number;
};

export type RequestSlice<T extends string> = {
  key: T;
  count: number;
};

export type RequestSupplierTotal = {
  supplier: string;
  count: number;
};

export type RequestsWorkspaceData = {
  requests: PurchaseRequestRow[];
  events: PurchaseRequestEvent[];
  totals: RequestTotals;
  byStatus: RequestSlice<RequestStatus>[];
  byPriority: RequestSlice<RequestPriority>[];
  topSuppliers: RequestSupplierTotal[];
  products: {
    id: number;
    name: string;
    reference: string | null;
    supplier_id: number;
  }[];
  suppliers: { id: number; name: string }[];
};

export type InvoiceStatusTotal = {
  status: InvoiceStatus;
  count: number;
  amount: number;
};

export type InvoiceMonth = { month: string; count: number; amount: number };

export type MovementMonth = {
  month: string;
  inbound: number;
  outbound: number;
  inbound_value: number;
  outbound_value: number;
};

export type MovementCategory = {
  category: string;
  type: "in" | "out";
  quantity: number;
  value: number;
};

export type TopProductByValue = {
  name: string;
  category: string;
  stock: number;
  value: number;
};

export type TopProductByQuantity = {
  name: string;
  category: string;
  quantity: number;
  value: number;
};

export type TopSupplier = {
  supplier: string;
  invoice_count: number;
  total: number;
  share: number;
};

export type StockStatus = "out_of_stock" | "low" | "near_out";

export type CriticalProduct = {
  name: string;
  category: string;
  stock: number;
  min_stock: number;
  value: number;
  status: StockStatus;
};

export type OverdueInvoice = {
  number: string;
  supplier: string;
  due_date: string;
  amount: number;
  days_late: number;
};

export type Indicators = {
  availabilityRate: number;
  stockTurnover: number;
  avgPaymentDays: number;
  dormantValue: number;
  dormantCount: number;
};

export type Alerts = {
  belowMin: number;
  outOfStock: number;
  toReorder: number;
  overdueInvoices: number;
};

export type Dashboard = {
  kpiHistory: KpiPoint[];
  stockByCategory: CategoryStock[];
  invoiceStatus: InvoiceStatusTotal[];
  invoicesByMonth: InvoiceMonth[];
  movementsByMonth: MovementMonth[];
  movementsByCategory: MovementCategory[];
  topProductsByValue: TopProductByValue[];
  topProductsByQuantity: TopProductByQuantity[];
  topSuppliers: TopSupplier[];
  criticalProducts: CriticalProduct[];
  overdueInvoices: OverdueInvoice[];
  indicators: Indicators;
  alerts: Alerts;
  /** `granularity` : pas des séries, choisi par la base selon la durée. */
  period: { start: string; end: string; granularity: "day" | "month" };
};

export type Lot = {
  id: number;
  lot_number: string;
  internal_ref: string | null;
  manufacturer_ref: string | null;
  manufacturer: string | null;
  packaging: string | null;
  expiry_date: string;
  initial_qty: number;
  current_qty: number;
  price_ht: number | null;
  unit_price: number | null;
  comment: string | null;
  created_at: string;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  product_id: number;
  product_name: string;
  category: string;
  supplier: string;
  days_left: number;
  is_expired: boolean;
  /** 1 = lot prioritaire FEFO ; null = périmé ou épuisé. */
  fefo_rank: number | null;
};

export type ProductOption = {
  id: number;
  name: string;
  category: string;
  supplier: string;
  unit_price: number;
};

export type LotStats = {
  total: number;
  active: number;
  inactive: number;
  expiringSoon: number;
  expired: number;
};

/** Conformité d'un lot, déduite de sa fiche — jamais saisie à la main. */
export type LotConformity = {
  conforme: boolean;
  /** Motifs de non-conformité, vide si le lot est conforme. */
  reasons: string[];
};

export type LotHistoryKind =
  | "created"
  | "updated"
  | "receipt"
  | "issue"
  | "count";

export type LotHistoryEvent = {
  lot_id: number;
  kind: LotHistoryKind;
  occurred_at: string;
  actor: string | null;
  /** Variation de stock portée par l'événement ; null si sans effet. */
  quantity: number | null;
  reference: string | null;
};

export type IssueMode = "automatic" | "manual";

export type PrescribedAnalysis = {
  id: number;
  batch_ref: string;
  code: string;
  name: string;
  section: string;
  sample_count: number;
  imported_at: string;
};

export type PendingConsumable = {
  product_id: number;
  product_name: string;
  reference: string | null;
  category: string;
  stock_available: number;
  raw_quantity: number;
  required_quantity: number;
  covered_samples: number;
  /** null si les analyses concernées n'utilisent pas le même coefficient. */
  coefficient: number | null;
  remaining_stock: number;
  is_available: boolean;
  lot_id: number | null;
  lot_number: string | null;
  expiry_date: string | null;
  lot_quantity: number | null;
};

export type CoefficientDetail = {
  code: string;
  analysis: string;
  consumables: string[];
};

export type IssueHistoryEntry = {
  id: number;
  mode: IssueMode;
  operator: string;
  issued_at: string;
  total_references: number;
  total_quantity: number;
};

/** Connecteur LIS déclaré (§3.2). Plusieurs sources peuvent coexister. */
export type LisSource = {
  id: number;
  slug: string;
  name: string;
  active: boolean;
  last_event_at: string | null;
};

export type LisEventStatus =
  | "accepted"
  | "duplicate"
  | "unknown_source"
  | "invalid_signature"
  | "unknown_analysis"
  | "malformed";

/** Ligne du journal d'appels entrants — pièce d'audit du flux LIS (§9.2). */
export type LisWebhookEvent = {
  id: number;
  slug: string | null;
  prescription_id: string | null;
  status: LisEventStatus;
  detail: string | null;
  analyses_created: number;
  received_at: string;
};

/** Coefficient de consommation, à plat pour la page de consultation (§7.2). */
export type AnalysisCoefficient = {
  analysis_code: string;
  analysis_name: string;
  section: string;
  product_name: string;
  reference: string | null;
  coefficient: number;
};

export type IssueWorkspaceData = {
  analyses: PrescribedAnalysis[];
  consumables: PendingConsumable[];
  coefficients: CoefficientDetail[];
  history: IssueHistoryEntry[];
  lastSync: string | null;
  sources: LisSource[];
  events: LisWebhookEvent[];
};

export type DeliveryStatus = "pending" | "partial" | "received";

export type PurchaseOrderOption = {
  id: number;
  number: string;
  supplier: string;
  ordered_at: string;
  status: DeliveryStatus;
};

export type OrderLine = {
  id: number;
  order_id: number;
  order_number: string;
  product_id: number;
  product_name: string;
  reference: string;
  category: string;
  supplier: string;
  quantity_ordered: number;
  quantity_received: number;
  quantity_remaining: number;
  unit_price: number;
  packaging: string | null;
  delivery_status: DeliveryStatus;
  /** Lots consommables du produit, ordonnés par ancienneté (FEFO). */
  fefoLots: { lot_number: string; expiry_date: string }[];
};

export type ReceiptHistoryEntry = {
  /** Identifiant de la ligne de réception. */
  id: number;
  /** En-tête de réception — cible d'une éventuelle contre-passation. */
  receipt_id: number;
  received_at: string;
  operator: string;
  quantity: number;
  unit_price: number;
  reference: string;
  product_name: string;
  lot_number: string | null;
  /** Permet d'imprimer l'étiquette via le module Marchandises. */
  lot_id: number | null;
  order_number: string;
  /** Non nul si la réception a été contre-passée. */
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
};

/** Bon de commande imprimable (§3 : consultation du BC d'origine). */
export type PurchaseOrderDocument = {
  id: number;
  number: string;
  ordered_at: string;
  status: DeliveryStatus;
  supplier: {
    name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  lines: {
    id: number;
    reference: string;
    product_name: string;
    packaging: string | null;
    quantity_ordered: number;
    quantity_received: number;
    unit_price: number;
  }[];
};

/** Cumuls d'un bon de commande, annulations déduites. */
export type OrderTotals = {
  receivedValue: number;
  unitsReceived: number;
  lotsCreated: number;
  receiptCount: number;
  /** Dernière écriture de stock sur ce bon de commande. */
  lastReceiptAt: string | null;
};

export type ReceiptsWorkspaceData = {
  orders: PurchaseOrderOption[];
  selectedOrder: PurchaseOrderOption | null;
  lines: OrderLine[];
  history: ReceiptHistoryEntry[];
  totals: OrderTotals;
};

/* ---- Inventaire analytique ---- */

export type AnalyticsStatus = "sain" | "alerte" | "rupture" | "surstock";

export type AnalyticsRow = {
  product_id: number;
  reference: string;
  product_name: string;
  category: string;
  supplier: string;
  packaging: string | null;
  stock_initial: number;
  entries: number;
  exits: number;
  stock_final: number;
  stock_average: number;
  cmj_short: number;
  cmj_long: number;
  /** null si l'article n'a aucune sortie sur la période : autonomie indéfinie. */
  coverage_days: number | null;
  rotation: number | null;
  cump: number;
  stock_value: number;
  safety_stock: number;
  alert_stock: number;
  min_stock: number;
  max_stock: number;
  status: AnalyticsStatus;
  order_quantity: number;
  order_value: number;
};

export type AnalyticsFilters = {
  coverageMin: number | null;
  coverageMax: number | null;
  status: AnalyticsStatus | "all";
  category: string;
  supplier: string;
};

export type AnalyticsTotals = {
  totalValue: number;
  directValue: number;
  safetyValue: number;
  alertValue: number;
  articles: number;
  catalogueArticles: number;
  byStatus: Record<AnalyticsStatus, number>;
  byCategory: { category: string; value: number }[];
};

export type AnalyticsWorkspaceData = {
  rows: AnalyticsRow[];
  categories: string[];
  suppliers: string[];
  exits: { day: string; quantity: number }[];
  catalogueArticles: number;
};

/** Lot affiché dans la fiche article (§8.5). */
export type ArticleLot = {
  id: number;
  lot_number: string;
  expiry_date: string;
  current_qty: number;
  location: string | null;
  is_expired: boolean;
};

/** Mouvement affiché dans l'onglet « Mouvements » (§8.6). */
export type ArticleMovement = {
  id: number;
  type: "in" | "out";
  quantity: number;
  moved_at: string;
};

export type ArticleDetail = {
  lots: ArticleLot[];
  movements: ArticleMovement[];
};

export type InventoryScope = "full" | "category";
export type InventoryStatus = "open" | "closed" | "cancelled";

export type InventorySession = {
  id: number;
  reference: string;
  scope: InventoryScope;
  category_id: number | null;
  status: InventoryStatus;
  opened_at: string;
  opened_by: string;
  closed_at: string | null;
  closed_by: string | null;
  counted_lines: number;
  variance_units: number;
  variance_value: number;
};

export type InventoryLine = {
  id: number;
  session_id: number;
  lot_id: number;
  product_id: number;
  product_name: string;
  reference: string;
  category: string;
  lot_number: string;
  expiry_date: string;
  expected_qty: number;
  counted_qty: number | null;
  unit_price: number;
  counted_at: string | null;
  counted_by: string | null;
  is_counted: boolean;
  variance_units: number | null;
  variance_value: number | null;
};

export type CategoryOption = { id: number; name: string };

export type InventoryWorkspaceData = {
  openSession: InventorySession | null;
  lines: InventoryLine[];
  categories: CategoryOption[];
  history: InventorySession[];
};
