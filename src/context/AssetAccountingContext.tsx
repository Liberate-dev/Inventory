import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { getAuthHeaders } from '../utils/api';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/public/api');

export type AssetStatus = 'active' | 'inactive' | 'fully_depreciated' | 'disposed';
export type FundingSource = 'dana_bos' | 'dana_komite' | 'hibah' | 'apbd' | 'yayasan' | 'lainnya';

export interface AssetCategory {
  id: number;
  name: string;
  gl_account_code: string | null;
  accumulated_dep_account_code: string | null;
  depreciation_expense_account_code: string | null;
  default_depreciation_method: string;
  default_useful_life_months: number;
  default_salvage_value_pct: number;
  default_depreciation_rate: number | null;
  capitalization_threshold: number;
  is_depreciable: boolean;
  is_active: boolean;
}

export interface Asset {
  id: number;
  asset_number: string;
  name: string;
  description: string | null;
  asset_category_id: number | null;
  inventory_item_id: number | null;
  acquisition_date: string;
  acquisition_cost: number;
  salvage_value: number;
  depreciable_amount: number;
  depreciation_method: string;
  useful_life_months: number;
  depreciation_rate: number | null;
  depreciation_start_date: string;
  location_id: number | null;
  responsible_user_id: number | null;
  condition: string;
  status: AssetStatus;
  inactive_reason: string | null;
  inactive_date: string | null;
  document_reference: string | null;
  funding_source: FundingSource;
  vendor_name: string | null;
  notes: string | null;
  created_by: number | null;
  approved_by: number | null;
  category_name?: string;
  location_name?: string;
  responsible_name?: string;
  current_book_value?: number;
  accumulated_depreciation?: number;
}

export interface DepreciationSchedule {
  id: number;
  asset_id: number;
  period_year: number;
  period_month: number;
  opening_book_value: number;
  depreciation_amount: number;
  accumulated_depreciation: number;
  closing_book_value: number;
  is_prorata: boolean;
  prorata_days: number | null;
  status: string;
}

export interface DepreciationRun {
  id: number;
  period_year: number;
  period_month: number;
  status: string;
  total_assets_processed: number;
  total_depreciation_amount: number;
  run_by_name?: string;
  posted_by_name?: string;
  posted_at?: string;
}

interface DepreciationPreview {
  period: { year: number; month: number; label: string };
  summary: {
    total_assets: number;
    included_assets: number;
    excluded_assets: number;
    pro_rata_count: number;
    total_depreciation: number;
  };
  items: DepreciationPreviewItem[];
  journal_preview: JournalPreviewLine[];
}

interface DepreciationPreviewItem {
  asset_id: number;
  asset_number: string;
  asset_name: string;
  category_name: string;
  opening_book_value: number;
  scheduled_depreciation: number;
  closing_book_value: number;
  is_included: boolean;
  status: string;
  status_note: string;
  is_prorata: boolean;
}

interface JournalPreviewLine {
  category: string;
  expense_account: string;
  accumulated_account: string;
  amount: number;
}

interface AssetAccountingContextType {
  // State
  categories: AssetCategory[];
  assets: Asset[];
  currentAsset: Asset | null;
  schedules: DepreciationSchedule[];
  depreciationRuns: DepreciationRun[];
  depreciationPreview: DepreciationPreview | null;
  loading: boolean;
  error: string | null;

  // Category actions
  fetchCategories: () => Promise<void>;
  createCategory: (data: Partial<AssetCategory>) => Promise<void>;
  updateCategory: (id: number, data: Partial<AssetCategory>) => Promise<void>;

  // Asset actions
  fetchAssets: (filters?: Record<string, string>) => Promise<void>;
  fetchAsset: (id: number) => Promise<void>;
  createAsset: (data: Partial<Asset>) => Promise<{ asset_id: number; asset_number: string }>;
  updateAsset: (id: number, data: Partial<Asset>) => Promise<void>;
  markAssetInactive: (id: number, data: { inactive_date: string; inactive_reason: string; condition?: string }) => Promise<void>;
  reactivateAsset: (id: number, reason: string) => Promise<void>;
  disposeAsset: (id: number, data: {
    disposal_date: string;
    disposal_method: string;
    disposal_reason: string;
    proceeds: number;
    document_reference?: string;
  }) => Promise<any>;

  // Depreciation actions
  fetchDepreciationRuns: () => Promise<void>;
  previewDepreciation: (year: number, month: number) => Promise<void>;
  postDepreciation: (year: number, month: number, selectedAssetIds?: string[]) => Promise<any>;
}

const AssetAccountingContext = createContext<AssetAccountingContextType | undefined>(undefined);

export function AssetAccountingProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [currentAsset, setCurrentAsset] = useState<Asset | null>(null);
  const [schedules, setSchedules] = useState<DepreciationSchedule[]>([]);
  const [depreciationRuns, setDepreciationRuns] = useState<DepreciationRun[]>([]);
  const [depreciationPreview, setDepreciationPreview] = useState<DepreciationPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/assets/categories.php`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.status === 'success') {
        setCategories(data.categories);
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  }, []);

  const createCategory = useCallback(async (data: Partial<AssetCategory>) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/assets/categories.php`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (result.status === 'success') {
        await fetchCategories();
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchCategories]);

  const updateCategory = useCallback(async (id: number, data: Partial<AssetCategory>) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/assets/categories.php`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id, ...data })
      });
      const result = await response.json();
      if (result.status === 'success') {
        await fetchCategories();
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update category');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchCategories]);

  const fetchAssets = useCallback(async (filters?: Record<string, string>) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(filters || {});
      const response = await fetch(`${API_BASE_URL}/assets/assets.php?${params}`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.status === 'success') {
        setAssets(data.assets);
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch assets');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAsset = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/assets/assets.php?id=${id}`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.status === 'success') {
        setCurrentAsset(data.asset);
        setSchedules(data.depreciation_schedules || []);
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch asset');
    } finally {
      setLoading(false);
    }
  }, []);

  const createAsset = useCallback(async (data: Partial<Asset>) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/assets/assets.php`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (result.status === 'success') {
        return { asset_id: result.asset_id, asset_number: result.asset_number };
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create asset');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateAsset = useCallback(async (id: number, data: Partial<Asset>) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/assets/assets.php`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id, ...data })
      });
      const result = await response.json();
      if (result.status === 'success') {
        await fetchAsset(id);
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update asset');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchAsset]);

  const markAssetInactive = useCallback(async (
    id: number,
    data: { inactive_date: string; inactive_reason: string; condition?: string }
  ) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/assets/assets.php?action=mark_inactive`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id, ...data })
      });
      const result = await response.json();
      if (result.status === 'success') {
        await fetchAssets();
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark asset inactive');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchAssets]);

  const reactivateAsset = useCallback(async (id: number, reason: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/assets/assets.php?action=reactivate`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id, reason })
      });
      const result = await response.json();
      if (result.status === 'success') {
        await fetchAssets();
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reactivate asset');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchAssets]);

  const disposeAsset = useCallback(async (
    id: number,
    data: {
      disposal_date: string;
      disposal_method: string;
      disposal_reason: string;
      proceeds: number;
      document_reference?: string;
    }
  ) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/assets/assets.php?action=dispose`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id, ...data })
      });
      const result = await response.json();
      if (result.status === 'success') {
        await fetchAssets();
        return result;
      }
      throw new Error(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispose asset');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchAssets]);

  const fetchDepreciationRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/assets/depreciation.php`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.status === 'success') {
        setDepreciationRuns(data.depreciation_runs);
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch depreciation runs');
    } finally {
      setLoading(false);
    }
  }, []);

  const previewDepreciation = useCallback(async (year: number, month: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/assets/depreciation.php?action=preview`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ year, month })
      });
      const data = await response.json();
      if (data.status === 'success') {
        setDepreciationPreview(data);
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview depreciation');
    } finally {
      setLoading(false);
    }
  }, []);

  const postDepreciation = useCallback(async (
    year: number,
    month: number,
    selectedAssetIds?: string[]
  ) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/assets/depreciation.php?action=post`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ year, month, selected_asset_ids: selectedAssetIds })
      });
      const data = await response.json();
      if (data.status === 'success') {
        setDepreciationPreview(null);
        await fetchDepreciationRuns();
        return data;
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post depreciation');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchDepreciationRuns]);

  return (
    <AssetAccountingContext.Provider
      value={{
        categories,
        assets,
        currentAsset,
        schedules,
        depreciationRuns,
        depreciationPreview,
        loading,
        error,
        fetchCategories,
        createCategory,
        updateCategory,
        fetchAssets,
        fetchAsset,
        createAsset,
        updateAsset,
        markAssetInactive,
        reactivateAsset,
        disposeAsset,
        fetchDepreciationRuns,
        previewDepreciation,
        postDepreciation
      }}
    >
      {children}
    </AssetAccountingContext.Provider>
  );
}

export function useAssetAccounting() {
  const context = useContext(AssetAccountingContext);
  if (!context) {
    throw new Error('useAssetAccounting must be used within AssetAccountingProvider');
  }
  return context;
}
