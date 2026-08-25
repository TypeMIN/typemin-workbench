export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.15" };
  public: {
    Tables: {
      workbench_sessions: {
        Row: {
          created_at: string;
          expires_at: string;
          id: number;
          token_hash: string;
          account_id: number;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          id?: never;
          token_hash: string;
          account_id: number;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: never;
          token_hash?: string;
          account_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "what_should_eat_sessions_user_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "workbench_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      workbench_accounts: {
        Row: {
          created_at: string;
          disabled_at: string | null;
          display_name: string;
          failed_login_attempts: number;
          id: number;
          last_login_at: string | null;
          login_id: string;
          locked_until: string | null;
          must_change_pin: boolean;
          pin_hash: string;
          role: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          disabled_at?: string | null;
          display_name: string;
          failed_login_attempts?: number;
          id?: never;
          last_login_at?: string | null;
          login_id: string;
          locked_until?: string | null;
          must_change_pin?: boolean;
          pin_hash: string;
          role?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          disabled_at?: string | null;
          display_name?: string;
          failed_login_attempts?: number;
          id?: never;
          last_login_at?: string | null;
          login_id?: string;
          locked_until?: string | null;
          must_change_pin?: boolean;
          pin_hash?: string;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      what_should_eat_profiles: {
        Row: {
          account_id: number;
          birth_year: number;
          created_at: string;
          gender: string;
          updated_at: string;
        };
        Insert: {
          account_id: number;
          birth_year: number;
          created_at?: string;
          gender: string;
          updated_at?: string;
        };
        Update: {
          account_id?: number;
          birth_year?: number;
          created_at?: string;
          gender?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "what_should_eat_profiles_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: true;
            referencedRelation: "workbench_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      workbench_auth_rate_limits: {
        Row: {
          action: string;
          expires_at: string;
          key_hash: string;
          request_count: number;
          window_started_at: string;
        };
        Insert: {
          action: string;
          expires_at: string;
          key_hash: string;
          request_count?: number;
          window_started_at: string;
        };
        Update: {
          action?: string;
          expires_at?: string;
          key_hash?: string;
          request_count?: number;
          window_started_at?: string;
        };
        Relationships: [];
      };
      what_should_eat_decision_participants: {
        Row: { decision_id: number; user_id: number };
        Insert: { decision_id: number; user_id: number };
        Update: { decision_id?: number; user_id?: number };
        Relationships: [
          {
            foreignKeyName: "what_should_eat_decision_participants_decision_id_fkey";
            columns: ["decision_id"];
            isOneToOne: false;
            referencedRelation: "what_should_eat_decisions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "what_should_eat_decision_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "workbench_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      what_should_eat_decisions: {
        Row: {
          address_name: string;
          category_name: string;
          decided_at: string;
          distance_meters: number;
          host_user_id: number;
          id: number;
          latitude: number;
          longitude: number;
          place_id: string;
          place_name: string;
          place_url: string;
          road_address_name: string;
        };
        Insert: {
          address_name?: string;
          category_name: string;
          decided_at?: string;
          distance_meters: number;
          host_user_id: number;
          id?: never;
          latitude: number;
          longitude: number;
          place_id: string;
          place_name: string;
          place_url?: string;
          road_address_name?: string;
        };
        Update: {
          address_name?: string;
          category_name?: string;
          decided_at?: string;
          distance_meters?: number;
          host_user_id?: number;
          id?: never;
          latitude?: number;
          longitude?: number;
          place_id?: string;
          place_name?: string;
          place_url?: string;
          road_address_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "what_should_eat_decisions_host_user_id_fkey";
            columns: ["host_user_id"];
            isOneToOne: false;
            referencedRelation: "workbench_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      what_should_eat_comparisons: {
        Row: {
          created_at: string;
          decision_id: number;
          host_user_id: number;
          id: number;
          loser_category_name: string;
          loser_place_id: string;
          round: number;
          winner_category_name: string;
          winner_place_id: string;
        };
        Insert: {
          created_at?: string;
          decision_id: number;
          host_user_id: number;
          id?: never;
          loser_category_name: string;
          loser_place_id: string;
          round: number;
          winner_category_name: string;
          winner_place_id: string;
        };
        Update: {
          created_at?: string;
          decision_id?: number;
          host_user_id?: number;
          id?: never;
          loser_category_name?: string;
          loser_place_id?: string;
          round?: number;
          winner_category_name?: string;
          winner_place_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "what_should_eat_comparisons_decision_id_fkey";
            columns: ["decision_id"];
            isOneToOne: false;
            referencedRelation: "what_should_eat_decisions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "what_should_eat_comparisons_host_user_id_fkey";
            columns: ["host_user_id"];
            isOneToOne: false;
            referencedRelation: "workbench_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      what_should_eat_place_feedback: {
        Row: {
          address_name: string;
          category_name: string;
          created_at: string;
          decision_id: number | null;
          id: number;
          latitude: number;
          longitude: number;
          place_id: string;
          place_name: string;
          place_url: string;
          response: string;
          road_address_name: string;
          source: string;
          updated_at: string;
          user_id: number;
        };
        Insert: {
          address_name?: string;
          category_name: string;
          created_at?: string;
          decision_id?: number | null;
          id?: never;
          latitude: number;
          longitude: number;
          place_id: string;
          place_name: string;
          place_url?: string;
          response: string;
          road_address_name?: string;
          source: string;
          updated_at?: string;
          user_id: number;
        };
        Update: {
          address_name?: string;
          category_name?: string;
          created_at?: string;
          decision_id?: number | null;
          id?: never;
          latitude?: number;
          longitude?: number;
          place_id?: string;
          place_name?: string;
          place_url?: string;
          response?: string;
          road_address_name?: string;
          source?: string;
          updated_at?: string;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "what_should_eat_place_feedback_decision_id_fkey";
            columns: ["decision_id"];
            isOneToOne: false;
            referencedRelation: "what_should_eat_decisions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "what_should_eat_place_feedback_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "workbench_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      workbench_record_login_failure: {
        Args: { p_account_id: number };
        Returns: string | null;
      };
      workbench_record_login_success: {
        Args: { p_account_id: number };
        Returns: undefined;
      };
      workbench_take_rate_limit: {
        Args: {
          p_action: string;
          p_key_hash: string;
          p_limit: number;
          p_window_seconds: number;
        };
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
