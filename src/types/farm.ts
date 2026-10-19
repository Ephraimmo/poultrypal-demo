export type FeedStrategy = 'grower_only' | 'grower_finisher';

export interface Batch {
  id: string;
  name: string;
  initialCount: number;
  currentCount: number;
  startDate: string;
  breed: string;
  status: 'active' | 'closed' | 'sold' | 'archived';
  sellingPricePerUnit: number;
  purchaseCostPerChick: number;
  feedStrategy?: FeedStrategy;
  feedSelections?: {
    starter: string; // feedSettingId
    grower: string;
    finisher: string;
  };
}

export interface FeedSetting {
  id: string;
  brand: string;
  feedType: 'Starter' | 'Grower' | 'Finisher';
  pricePerBag: number;
  bagsPerHundredChickens: number;
  stockBags: number; // available stock
}

export interface WeightRecord {
  id: string;
  batchId: string;
  date: string;
  weightGrams: number;
  notes: string;
}

export interface MortalityRecord {
  id: string;
  batchId: string;
  batchName?: string;
  date: string;
  count: number;
  cause: string;
  costPerBird?: number;
  totalCost?: number;
}

export type PaymentMethod = 'cash' | 'eft' | 'card' | 'other';

export interface PaymentCollection {
  id: string;
  saleId: string;
  batchId: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  capturedBy?: string;
  notes?: string;
  /** If set, this collection was funded by a specific advance payment. */
  sourceAdvanceId?: string;
}

export interface MortalityResell {
  id: string;
  mortalityId: string;
  batchId: string;
  date: string;
  quantity: number;
  pricePerUnit: number;
  totalAmount: number;
  buyer?: string;
  notes?: string;
}

export interface SaleRecord {
  id: string;
  batchId: string;
  /** Required for new sales. Legacy sales may not have this. */
  harvestId?: string;
  date: string;
  quantity: number;
  pricePerUnit: number;
  buyer: string;
  buyerId?: string;
  buyerPhone?: string;
  /** Missing = 'paid' (legacy back-compat). 'advance' = fully covered by pre-paid advance. */
  paymentStatus?: 'paid' | 'pending' | 'advance';
  /** For pending sales, running total collected. Not used for paid sales. */
  amountCollected?: number;
  invoiceNumber?: string;
  /** IDs of AdvancePayment records that funded this sale (advance-typed sales). */
  advanceIds?: string[];
  /** Per-advance breakdown of amounts consumed when the sale was created. */
  advanceAllocations?: { advanceId: string; amount: number }[];
}

export interface Buyer {
  id: string;
  name: string;
  phone?: string;
  notes?: string;
  createdAt: string;
}

/**
 * Money received from a customer BEFORE any sale is captured.
 * Sits as a liability (customer credit) until applied to a sale.
 */
export interface AdvancePayment {
  id: string;
  buyerId: string;
  buyerName: string;
  date: string;
  amount: number;
  /** Portion already allocated to sales. remaining = amount - applied. */
  applied: number;
  method: PaymentMethod;
  notes?: string;
}

export interface FeedRecord {
  id: string;
  batchId: string;
  date: string;
  bags: number;
  feedType: string;
  costPerBag: number;
  feedSettingId?: string; // link to FeedSetting for stock deduction
}

export interface HealthRecord {
  id: string;
  batchId: string;
  date: string;
  type: 'disease' | 'vaccination' | 'treatment';
  description: string;
  medication: string;
  notes: string;
}

export interface ExpenseRecord {
  id: string;
  date: string;
  category: 'feed' | 'healthcare' | 'equipment' | 'labor' | 'utilities' | 'new_batches' | 'other';
  description: string;
  amount: number;
  batchId?: string;
}

export interface EnvironmentRecord {
  id: string;
  /** User-given name for this environment / reading location. */
  name?: string;
  date: string;
  temperature: number;
  humidity: number;
  notes: string;
  /** Batch the reading belongs to, used for age-based recommendations. */
  batchId?: string;
}

/** A named monitored environment tied to a Firebase sensor and one or more batches. */
export interface Environment {
  id: string;
  name: string;
  /** Firebase RTDB path returning { temperature, humidity }. Defaults to `<name>/sensors/current`. */
  sensorPath?: string;
  batchIds: string[];
  createdAt: string;
}

export type AlertSeverity = 'warning' | 'critical';

export interface EnvironmentAlert {
  id: string;
  environmentId: string;
  environmentName: string;
  batchIds: string[];
  batchNames: string[];
  temperature: number | null;
  humidity: number | null;
  tempRange: [number, number];
  humidityRange: [number, number];
  tempStatus: 'ok' | 'low' | 'high' | 'unknown';
  humidityStatus: 'ok' | 'low' | 'high' | 'unknown';
  severity: AlertSeverity;
  triggeredAt: string;
  resolvedAt?: string;
  acknowledgedAt?: string;
  active: boolean;
}

export type TimeFilter = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface HarvestRecord {
  id: string;
  batchId: string;
  date: string;
  /** Number of chickens harvested / marked ready for sale. */
  quantity: number;
  averageWeightKg?: number;
  totalWeightKg?: number;
  notes?: string;
  createdBy?: string;
  createdAt: string;
}

export type HarvestStatus = 'available' | 'partially_sold' | 'sold_out';
