import React, { createContext, useContext, ReactNode } from 'react';
import { useFirebaseSync } from '@/hooks/useFirebaseSync';
import type { Batch, MortalityRecord, MortalityResell, SaleRecord, FeedRecord, HealthRecord, ExpenseRecord, EnvironmentRecord, FeedSetting, WeightRecord, PaymentCollection, Buyer, AdvancePayment, HarvestRecord, Environment, EnvironmentAlert } from '@/types/farm';

interface FarmContextType {
  batches: Batch[];
  setBatches: (v: Batch[] | ((p: Batch[]) => Batch[])) => void;
  mortality: MortalityRecord[];
  setMortality: (v: MortalityRecord[] | ((p: MortalityRecord[]) => MortalityRecord[])) => void;
  mortalityResells: MortalityResell[];
  setMortalityResells: (v: MortalityResell[] | ((p: MortalityResell[]) => MortalityResell[])) => void;
  sales: SaleRecord[];
  setSales: (v: SaleRecord[] | ((p: SaleRecord[]) => SaleRecord[])) => void;
  collections: PaymentCollection[];
  setCollections: (v: PaymentCollection[] | ((p: PaymentCollection[]) => PaymentCollection[])) => void;
  feed: FeedRecord[];
  setFeed: (v: FeedRecord[] | ((p: FeedRecord[]) => FeedRecord[])) => void;
  health: HealthRecord[];
  setHealth: (v: HealthRecord[] | ((p: HealthRecord[]) => HealthRecord[])) => void;
  expenses: ExpenseRecord[];
  setExpenses: (v: ExpenseRecord[] | ((p: ExpenseRecord[]) => ExpenseRecord[])) => void;
  environment: EnvironmentRecord[];
  setEnvironment: (v: EnvironmentRecord[] | ((p: EnvironmentRecord[]) => EnvironmentRecord[])) => void;
  feedSettings: FeedSetting[];
  setFeedSettings: (v: FeedSetting[] | ((p: FeedSetting[]) => FeedSetting[])) => void;
  weightRecords: WeightRecord[];
  setWeightRecords: (v: WeightRecord[] | ((p: WeightRecord[]) => WeightRecord[])) => void;
  buyers: Buyer[];
  setBuyers: (v: Buyer[] | ((p: Buyer[]) => Buyer[])) => void;
  advances: AdvancePayment[];
  setAdvances: (v: AdvancePayment[] | ((p: AdvancePayment[]) => AdvancePayment[])) => void;
  harvests: HarvestRecord[];
  setHarvests: (v: HarvestRecord[] | ((p: HarvestRecord[]) => HarvestRecord[])) => void;
  environments: Environment[];
  setEnvironments: (v: Environment[] | ((p: Environment[]) => Environment[])) => void;
  envAlerts: EnvironmentAlert[];
  setEnvAlerts: (v: EnvironmentAlert[] | ((p: EnvironmentAlert[]) => EnvironmentAlert[])) => void;
  loaded: boolean;
}

const FarmContext = createContext<FarmContextType | undefined>(undefined);

export function FarmProvider({ children }: { children: ReactNode }) {
  const [batches, setBatches, batchesLoaded] = useFirebaseSync<Batch[]>('batches', []);
  const [mortality, setMortality, mortalityLoaded] = useFirebaseSync<MortalityRecord[]>('mortality', []);
  const [mortalityResells, setMortalityResells, mortalityResellsLoaded] = useFirebaseSync<MortalityResell[]>('mortalityResells', []);
  const [sales, setSales, salesLoaded] = useFirebaseSync<SaleRecord[]>('sales', []);
  const [collections, setCollections, collectionsLoaded] = useFirebaseSync<PaymentCollection[]>('collections', []);
  const [feed, setFeed, feedLoaded] = useFirebaseSync<FeedRecord[]>('feed', []);
  const [health, setHealth, healthLoaded] = useFirebaseSync<HealthRecord[]>('health', []);
  const [expenses, setExpenses, expensesLoaded] = useFirebaseSync<ExpenseRecord[]>('expenses', []);
  const [environment, setEnvironment, envLoaded] = useFirebaseSync<EnvironmentRecord[]>('environment', []);
  const [feedSettings, setFeedSettings, feedSettingsLoaded] = useFirebaseSync<FeedSetting[]>('feedSettings', []);
  const [weightRecords, setWeightRecords, weightLoaded] = useFirebaseSync<WeightRecord[]>('weightRecords', []);
  const [buyers, setBuyers, buyersLoaded] = useFirebaseSync<Buyer[]>('buyers', []);
  const [advances, setAdvances, advancesLoaded] = useFirebaseSync<AdvancePayment[]>('advances', []);
  const [harvests, setHarvests, harvestsLoaded] = useFirebaseSync<HarvestRecord[]>('harvests', []);
  const [environments, setEnvironments, environmentsLoaded] = useFirebaseSync<Environment[]>('environments', []);
  const [envAlerts, setEnvAlerts, envAlertsLoaded] = useFirebaseSync<EnvironmentAlert[]>('envAlerts', []);

  const loaded = batchesLoaded && mortalityLoaded && mortalityResellsLoaded && salesLoaded && collectionsLoaded && feedLoaded && healthLoaded && expensesLoaded && envLoaded && feedSettingsLoaded && weightLoaded && buyersLoaded && advancesLoaded && harvestsLoaded && environmentsLoaded && envAlertsLoaded;

  return (
    <FarmContext.Provider value={{ batches, setBatches, mortality, setMortality, mortalityResells, setMortalityResells, sales, setSales, collections, setCollections, feed, setFeed, health, setHealth, expenses, setExpenses, environment, setEnvironment, feedSettings, setFeedSettings, weightRecords, setWeightRecords, buyers, setBuyers, advances, setAdvances, harvests, setHarvests, environments, setEnvironments, envAlerts, setEnvAlerts, loaded }}>
      {children}
    </FarmContext.Provider>
  );
}

export function useFarm() {
  const context = useContext(FarmContext);
  if (!context) throw new Error('useFarm must be used within FarmProvider');
  return context;
}
