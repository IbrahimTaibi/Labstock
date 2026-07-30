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
