/**
 * Database types for the tables and functions the app uses.
 * Hand-maintained until the Supabase CLI can generate them
 * (`supabase gen types typescript --linked > src/data/supabase/database.types.ts`);
 * keep in sync with supabase/migrations. Numeric columns are always selected
 * as text (`amount::text`) so they are typed as string here.
 */
import type { AssetCategory, AssetStatus, ValuationMode } from "@/domain/investments/types";
import type { AccountStatus, AccountType, TransactionKind, TransactionStatus } from "@/domain/ledger/types";

export type ThemePreference = "system" | "light" | "dark";
export type CategoryKind = "income" | "expense";

type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

export type AccountRow = {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  class: "asset" | "liability";
  currency: string;
  opening_balance: string;
  opening_date: string;
  institution: string | null;
  notes: string | null;
  status: AccountStatus;
  include_in_net_worth: boolean;
  is_liquid: boolean;
  created_at: string;
  updated_at: string;
};

export type CategoryRow = {
  id: string;
  user_id: string;
  name: string;
  kind: CategoryKind;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
  is_archived: boolean;
  system_key: string | null;
  created_at: string;
  updated_at: string;
};

export type ReconciliationRow = {
  id: string;
  user_id: string;
  account_id: string;
  statement_date: string;
  statement_balance: string;
  computed_cleared_balance: string;
  difference: string;
  adjustment_transaction_id: string | null;
  note: string | null;
  created_at: string;
};

export type AuditEventRow = {
  id: number;
  user_id: string;
  table_name: string;
  record_id: string;
  action: "insert" | "update" | "delete";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: string | null;
  occurred_at: string;
  txid: number;
};

export type BudgetRow = {
  id: string;
  user_id: string;
  month: string;
  category_id: string | null;
  amount: string;
  currency: string;
  created_at: string;
  updated_at: string;
};

export type GoalRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  target_amount: string;
  currency: string;
  target_date: string | null;
  funding_mode: "linked_account" | "allocations";
  linked_account_id: string | null;
  status: "active" | "completed" | "archived";
  completed_on: string | null;
  created_at: string;
  updated_at: string;
};

export type AllocationRow = {
  id: string;
  user_id: string;
  goal_id: string;
  allocated_on: string;
  amount: string;
  source_account_id: string | null;
  note: string | null;
  created_at: string;
};

export type ExchangeRateRow = {
  id: string;
  user_id: string;
  base: string;
  quote: string;
  rate: string;
  effective_on: string;
  source_note: string | null;
  created_at: string;
  updated_at: string;
};

export type SnapshotRow = {
  id: string;
  user_id: string;
  as_of: string;
  base_currency: string;
  total_assets: string;
  total_liabilities: string;
  net_worth: string;
  method_version: number;
  details: Record<string, unknown>;
  created_at: string;
};

export type AssetRow = {
  id: string;
  user_id: string;
  name: string;
  symbol: string | null;
  category: AssetCategory;
  currency: string;
  quantity_scale: number;
  unit_label: string;
  valuation_mode: ValuationMode;
  details: Record<string, unknown>;
  price_source: "manual";
  status: AssetStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AssetValuationRow = {
  id: string;
  user_id: string;
  asset_id: string;
  valued_on: string;
  unit_price: string;
  entered_as: "unit_price" | "total_value";
  entered_total: string | null;
  quantity_at_entry: string | null;
  source: "manual" | "import" | "provider";
  source_note: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileRow = {
  user_id: string;
  display_name: string | null;
  base_currency: string;
  timezone: string;
  theme: ThemePreference;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        never,
        Partial<Pick<ProfileRow, "display_name" | "base_currency" | "timezone" | "theme">>
      >;
      currencies: Table<{ code: string; name: string; minor_units: number }, never, never>;
      accounts: Table<
        AccountRow,
        Omit<AccountRow, "id" | "user_id" | "class" | "created_at" | "updated_at" | "is_liquid"> & {
          is_liquid?: boolean;
        },
        Partial<Omit<AccountRow, "id" | "user_id" | "class" | "created_at" | "updated_at">>
      >;
      categories: Table<
        CategoryRow,
        Pick<CategoryRow, "name" | "kind"> & Partial<Pick<CategoryRow, "parent_id" | "color" | "icon">>,
        Partial<Pick<CategoryRow, "name" | "parent_id" | "color" | "icon" | "is_archived" | "kind">>
      >;
      reconciliations: Table<ReconciliationRow, never, never>;
      audit_events: Table<AuditEventRow, never, never>;
      budgets: Table<
        BudgetRow,
        Pick<BudgetRow, "month" | "category_id" | "amount" | "currency">,
        Partial<Pick<BudgetRow, "amount" | "currency">>
      >;
      savings_goals: Table<
        GoalRow,
        Pick<
          GoalRow,
          "name" | "description" | "target_amount" | "currency" | "target_date" | "funding_mode" | "linked_account_id"
        >,
        Partial<Omit<GoalRow, "id" | "user_id" | "created_at" | "updated_at">>
      >;
      goal_allocations: Table<
        AllocationRow,
        Pick<AllocationRow, "goal_id" | "allocated_on" | "amount" | "source_account_id" | "note">,
        never
      >;
      exchange_rates: Table<
        ExchangeRateRow,
        Pick<ExchangeRateRow, "base" | "quote" | "rate" | "effective_on" | "source_note">,
        Partial<Pick<ExchangeRateRow, "rate" | "effective_on" | "source_note">>
      >;
      net_worth_snapshots: Table<SnapshotRow, Omit<SnapshotRow, "id" | "user_id" | "created_at">, never>;
      assets: Table<
        AssetRow,
        Pick<AssetRow, "name" | "category" | "currency" | "quantity_scale" | "unit_label" | "valuation_mode"> &
          Partial<Pick<AssetRow, "symbol" | "details" | "notes" | "status">>,
        Partial<
          Pick<
            AssetRow,
            | "name"
            | "symbol"
            | "category"
            | "currency"
            | "quantity_scale"
            | "unit_label"
            | "valuation_mode"
            | "details"
            | "notes"
            | "status"
          >
        >
      >;
      // Written only through RPCs; read directly for import duplicate checks.
      transactions: Table<
        { id: string; occurred_on: string; import_batch_id: string | null; import_fingerprint: string | null },
        never,
        never
      >;
      import_batches: Table<
        {
          id: string;
          user_id: string;
          kind: "transactions_csv" | "backup_restore";
          file_name: string | null;
          row_count: number;
          summary: Record<string, unknown>;
          created_at: string;
        },
        never,
        never
      >;
      asset_valuations: Table<
        AssetValuationRow,
        Pick<AssetValuationRow, "asset_id" | "valued_on" | "unit_price" | "entered_as"> &
          Partial<Pick<AssetValuationRow, "entered_total" | "quantity_at_entry" | "source_note">>,
        never
      >;
    };
    Views: Record<never, never>;
    Functions: {
      create_transaction: { Args: { p: TransactionPayload }; Returns: string };
      update_transaction: {
        Args: { p_id: string; p: TransactionPayload; p_expected_updated_at: string; p_unlock: boolean };
        Returns: string;
      };
      delete_transaction: {
        Args: { p_id: string; p_expected_updated_at: string; p_unlock: boolean };
        Returns: undefined;
      };
      account_line_totals: {
        Args: { p_as_of?: string | null };
        Returns: {
          account_id: string;
          status: TransactionStatus;
          total: string;
          line_count: number;
          last_on: string;
        }[];
      };
      list_transactions: {
        Args: { p_filter: TransactionFilterPayload; p_limit: number };
        Returns: TransactionListPayload;
      };
      account_postings: {
        Args: { p_account_id: string };
        Returns: {
          transaction_id: string;
          occurred_on: string;
          created_at: string;
          kind: TransactionKind;
          status: TransactionStatus;
          description: string;
          payee: string | null;
          amount: string;
          category_id: string | null;
          reconciliation_id: string | null;
          other_account_id: string | null;
        }[];
      };
      merge_category: { Args: { p_from: string; p_into: string }; Returns: undefined };
      transaction_history: {
        Args: { p_id: string };
        Returns: { txid: number; occurred_at: string; header_actions: string[] }[];
      };
      category_usage: { Args: Record<string, never>; Returns: { category_id: string; line_count: number }[] };
      reconcile_account: { Args: { p: ReconcilePayload }; Returns: string };
      copy_budgets: { Args: { p_from: string; p_to: string }; Returns: number };
      ledger_lines: {
        Args: { p_from?: string | null; p_to?: string | null };
        Returns: {
          transaction_id: string;
          account_id: string;
          amount: string;
          category_id: string | null;
          occurred_on: string;
          status: TransactionStatus;
          kind: TransactionKind;
        }[];
      };
      holding_movements_list: {
        Args: { p_to?: string | null };
        Returns: {
          id: string;
          transaction_id: string;
          account_id: string;
          asset_id: string;
          kind: TransactionKind;
          occurred_on: string;
          created_at: string;
          quantity: string;
          unit_price: string | null;
          fee: string;
          cost_amount: string | null;
        }[];
      };
      import_transactions: {
        Args: {
          p: {
            file_name: string;
            summary: Record<string, string | number>;
            rows: (TransactionPayload & { import_fingerprint: string | null })[];
          };
        };
        Returns: string;
      };
      undo_import: { Args: { p_batch_id: string; p_unlock: boolean }; Returns: number };
      restore_backup: { Args: { p: Record<string, unknown> }; Returns: Record<string, number> };
      delete_my_data: { Args: Record<string, never>; Returns: undefined };
      asset_cash_lines: {
        Args: { p_to?: string | null };
        Returns: {
          transaction_id: string;
          asset_id: string;
          kind: TransactionKind;
          occurred_on: string;
          account_id: string;
          amount: string;
        }[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type TransactionPayload = {
  kind: TransactionKind;
  occurred_on: string;
  description: string;
  payee: string | null;
  notes: string | null;
  tags: string[];
  status: TransactionStatus;
  refund_of_id: string | null;
  lines: { account_id: string; amount: string; category_id: string | null; memo?: string | null }[];
  /** Investment transactions only: the asset, and its holding movements. */
  asset_id?: string | null;
  movements?: MovementPayload[];
};

export type MovementPayload = {
  account_id: string;
  quantity: string;
  unit_price?: string | null;
  fee?: string;
  cost_amount?: string | null;
};

export type TransactionFilterPayload = {
  id?: string;
  account_id?: string;
  category_id?: string;
  asset_id?: string;
  kinds?: TransactionKind[];
  status?: TransactionStatus;
  from?: string;
  to?: string;
  tag?: string;
  q?: string;
  order?: "asc" | "desc";
  cursor?: { occurred_on: string; created_at: string; id: string };
};

export type TransactionListPayload = {
  items: {
    id: string;
    kind: TransactionKind;
    occurred_on: string;
    description: string;
    payee: string | null;
    notes: string | null;
    tags: string[];
    status: TransactionStatus;
    refund_of_id: string | null;
    reconciliation_id: string | null;
    asset_id: string | null;
    created_at: string;
    updated_at: string;
    lines: { id: string; account_id: string; amount: string; category_id: string | null; memo: string | null }[];
    movements: {
      id: string;
      account_id: string;
      asset_id: string;
      quantity: string;
      unit_price: string | null;
      fee: string;
      cost_amount: string | null;
    }[];
  }[];
  has_more: boolean;
};

export type ReconcilePayload = {
  account_id: string;
  statement_date: string;
  statement_balance: string;
  clear_transaction_ids: string[];
  create_adjustment: boolean;
  note: string | null;
};
