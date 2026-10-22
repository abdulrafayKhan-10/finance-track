/**
 * Database types for the tables the app currently queries.
 * Hand-maintained until the Supabase CLI can generate them
 * (`supabase gen types typescript --linked > src/data/supabase/database.types.ts`);
 * keep in sync with supabase/migrations.
 */
export type ThemePreference = "system" | "light" | "dark";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          display_name: string | null;
          base_currency: string;
          timezone: string;
          theme: ThemePreference;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          display_name?: string | null;
          base_currency?: string;
          timezone?: string;
          theme?: ThemePreference;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      theme_preference: ThemePreference;
    };
    CompositeTypes: Record<never, never>;
  };
};
