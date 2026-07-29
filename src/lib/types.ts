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
