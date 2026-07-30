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
  period: { start: string; end: string };
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

export type IssueWorkspaceData = {
  analyses: PrescribedAnalysis[];
  consumables: PendingConsumable[];
  coefficients: CoefficientDetail[];
  history: IssueHistoryEntry[];
  lastSync: string | null;
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
};

export type ReceiptHistoryEntry = {
  id: number;
  received_at: string;
  operator: string;
  quantity: number;
  reference: string;
  lot_number: string | null;
};

export type ReceiptsWorkspaceData = {
  orders: PurchaseOrderOption[];
  selectedOrder: PurchaseOrderOption | null;
  lines: OrderLine[];
  history: ReceiptHistoryEntry[];
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
