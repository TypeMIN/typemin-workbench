export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      baseball_game_actions: {
        Row: {
          action: Json;
          actor_player_id: string | null;
          actor_team: string;
          created_at: string;
          events: Json;
          expected_revision: number;
          game_id: string;
          idempotency_key: string;
          result_revision: number;
          room_revision: number | null;
          sequence: number;
        };
        Insert: {
          action: Json;
          actor_player_id?: string | null;
          actor_team: string;
          created_at?: string;
          events: Json;
          expected_revision: number;
          game_id: string;
          idempotency_key: string;
          result_revision: number;
          room_revision?: number | null;
          sequence: number;
        };
        Update: {
          action?: Json;
          actor_player_id?: string | null;
          actor_team?: string;
          created_at?: string;
          events?: Json;
          expected_revision?: number;
          game_id?: string;
          idempotency_key?: string;
          result_revision?: number;
          room_revision?: number | null;
          sequence?: number;
        };
        Relationships: [
          {
            foreignKeyName: "baseball_game_actions_actor_player_id_fkey";
            columns: ["actor_player_id"];
            isOneToOne: false;
            referencedRelation: "baseball_party_players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "baseball_game_actions_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "baseball_games";
            referencedColumns: ["id"];
          },
        ];
      };
      baseball_game_seats: {
        Row: {
          game_id: string;
          joined_at: string;
          last_seen_at: string;
          team: string;
          token_hash: string;
        };
        Insert: {
          game_id: string;
          joined_at?: string;
          last_seen_at?: string;
          team: string;
          token_hash: string;
        };
        Update: {
          game_id?: string;
          joined_at?: string;
          last_seen_at?: string;
          team?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "baseball_game_seats_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "baseball_games";
            referencedColumns: ["id"];
          },
        ];
      };
      baseball_games: {
        Row: {
          created_at: string;
          expires_at: string;
          host_token_hash: string | null;
          id: string;
          mode: string;
          party_state: Json | null;
          revision: number;
          room_code: string;
          room_revision: number;
          state: Json;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string;
          host_token_hash?: string | null;
          id?: string;
          mode?: string;
          party_state?: Json | null;
          revision?: number;
          room_code: string;
          room_revision?: number;
          state: Json;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          host_token_hash?: string | null;
          id?: string;
          mode?: string;
          party_state?: Json | null;
          revision?: number;
          room_code?: string;
          room_revision?: number;
          state?: Json;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      baseball_party_events: {
        Row: {
          actor_player_id: string | null;
          created_at: string;
          event_type: string;
          game_id: string;
          payload: Json;
          sequence: number;
        };
        Insert: {
          actor_player_id?: string | null;
          created_at?: string;
          event_type: string;
          game_id: string;
          payload?: Json;
          sequence: number;
        };
        Update: {
          actor_player_id?: string | null;
          created_at?: string;
          event_type?: string;
          game_id?: string;
          payload?: Json;
          sequence?: number;
        };
        Relationships: [
          {
            foreignKeyName: "baseball_party_events_actor_player_id_fkey";
            columns: ["actor_player_id"];
            isOneToOne: false;
            referencedRelation: "baseball_party_players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "baseball_party_events_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "baseball_games";
            referencedColumns: ["id"];
          },
        ];
      };
      baseball_party_players: {
        Row: {
          game_id: string;
          id: string;
          joined_at: string;
          last_seen_at: string;
          nickname: string;
          removed_at: string | null;
          team: string;
          token_hash: string;
        };
        Insert: {
          game_id: string;
          id?: string;
          joined_at?: string;
          last_seen_at?: string;
          nickname: string;
          removed_at?: string | null;
          team: string;
          token_hash: string;
        };
        Update: {
          game_id?: string;
          id?: string;
          joined_at?: string;
          last_seen_at?: string;
          nickname?: string;
          removed_at?: string | null;
          team?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "baseball_party_players_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "baseball_games";
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
      what_should_eat_decision_participants: {
        Row: {
          decision_id: number;
          user_id: number;
        };
        Insert: {
          decision_id: number;
          user_id: number;
        };
        Update: {
          decision_id?: number;
          user_id?: number;
        };
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
      workbench_accounts: {
        Row: {
          created_at: string;
          disabled_at: string | null;
          display_name: string;
          failed_login_attempts: number;
          id: number;
          last_login_at: string | null;
          locked_until: string | null;
          login_id: string;
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
          locked_until?: string | null;
          login_id: string;
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
          locked_until?: string | null;
          login_id?: string;
          must_change_pin?: boolean;
          pin_hash?: string;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
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
      workbench_sessions: {
        Row: {
          account_id: number;
          created_at: string;
          expires_at: string;
          id: number;
          token_hash: string;
        };
        Insert: {
          account_id: number;
          created_at?: string;
          expires_at: string;
          id?: never;
          token_hash: string;
        };
        Update: {
          account_id?: number;
          created_at?: string;
          expires_at?: string;
          id?: never;
          token_hash?: string;
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
      worldcup_events: {
        Row: {
          created_at: string;
          id: number;
        };
        Insert: {
          created_at?: string;
          id?: never;
        };
        Update: {
          created_at?: string;
          id?: never;
        };
        Relationships: [];
      };
      worldcup_matches: {
        Row: {
          external_id: string | null;
          id: string;
          kickoff: string | null;
          label: string;
          result_away: number | null;
          result_duration: string | null;
          result_home: number | null;
          result_pen_away: number | null;
          result_pen_home: number | null;
          result_regular: string | null;
          result_team: string | null;
          stage: string;
          synced_pre: boolean;
          team_a: string;
          team_a_crest: string | null;
          team_b: string;
          team_b_crest: string | null;
          updated_at: string;
        };
        Insert: {
          external_id?: string | null;
          id: string;
          kickoff?: string | null;
          label: string;
          result_away?: number | null;
          result_duration?: string | null;
          result_home?: number | null;
          result_pen_away?: number | null;
          result_pen_home?: number | null;
          result_regular?: string | null;
          result_team?: string | null;
          stage: string;
          synced_pre?: boolean;
          team_a: string;
          team_a_crest?: string | null;
          team_b: string;
          team_b_crest?: string | null;
          updated_at?: string;
        };
        Update: {
          external_id?: string | null;
          id?: string;
          kickoff?: string | null;
          label?: string;
          result_away?: number | null;
          result_duration?: string | null;
          result_home?: number | null;
          result_pen_away?: number | null;
          result_pen_home?: number | null;
          result_regular?: string | null;
          result_team?: string | null;
          stage?: string;
          synced_pre?: boolean;
          team_a?: string;
          team_a_crest?: string | null;
          team_b?: string;
          team_b_crest?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      worldcup_participants: {
        Row: {
          id: string;
          login_enabled: boolean;
          name: string;
          pin: string | null;
          registered: boolean;
          slot: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          login_enabled?: boolean;
          name: string;
          pin?: string | null;
          registered?: boolean;
          slot: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          login_enabled?: boolean;
          name?: string;
          pin?: string | null;
          registered?: boolean;
          slot?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      worldcup_predictions: {
        Row: {
          match_id: string;
          participant_id: string;
          regular: string;
          team: string;
          updated_at: string;
        };
        Insert: {
          match_id: string;
          participant_id: string;
          regular: string;
          team: string;
          updated_at?: string;
        };
        Update: {
          match_id?: string;
          participant_id?: string;
          regular?: string;
          team?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "worldcup_predictions_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "worldcup_matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "worldcup_predictions_participant_id_fkey";
            columns: ["participant_id"];
            isOneToOne: false;
            referencedRelation: "worldcup_participants";
            referencedColumns: ["id"];
          },
        ];
      };
      worldcup_settings: {
        Row: {
          admin_pin: string | null;
          api_last_message: string;
          api_last_sync: string | null;
          archived_at: string | null;
          id: boolean;
        };
        Insert: {
          admin_pin?: string | null;
          api_last_message?: string;
          api_last_sync?: string | null;
          archived_at?: string | null;
          id?: boolean;
        };
        Update: {
          admin_pin?: string | null;
          api_last_message?: string;
          api_last_sync?: string | null;
          archived_at?: string | null;
          id?: boolean;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      baseball_claim_home_seat: {
        Args: { p_room_code: string; p_token_hash: string };
        Returns: Json;
      };
      baseball_commit_action: {
        Args: {
          p_action: Json;
          p_actor_team: string;
          p_events: Json;
          p_expected_revision: number;
          p_game_id: string;
          p_idempotency_key: string;
          p_new_state: Json;
        };
        Returns: Json;
      };
      baseball_party_commit_action: {
        Args: {
          p_action: Json;
          p_actor_player_id: string;
          p_actor_team: string;
          p_events: Json;
          p_expected_revision: number;
          p_expected_room_revision: number;
          p_game_id: string;
          p_idempotency_key: string;
          p_new_state: Json;
          p_party_state: Json;
        };
        Returns: Json;
      };
      baseball_party_heartbeat: {
        Args: { p_game_id: string; p_player_id: string };
        Returns: boolean;
      };
      baseball_party_host_mutation: {
        Args: {
          p_event_type: string;
          p_expected_room_revision: number;
          p_game_id: string;
          p_party_state: Json;
          p_payload: Json;
          p_player_operation: Json;
          p_state: Json;
          p_status: string;
        };
        Returns: Json;
      };
      baseball_party_join: {
        Args: {
          p_expected_room_revision: number;
          p_nickname: string;
          p_room_code: string;
          p_team: string;
          p_token_hash: string;
        };
        Returns: Json;
      };
      workbench_record_login_failure: {
        Args: { p_account_id: number };
        Returns: string;
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
      worldcup_admin_save_setup: {
        Args: { p_admin_pin: string; p_matches: Json; p_participants: Json };
        Returns: Json;
      };
      worldcup_admin_set_result: {
        Args: {
          p_admin_pin: string;
          p_match_id: string;
          p_regular: string;
          p_team: string;
        };
        Returns: Json;
      };
      worldcup_admin_state: { Args: { p_admin_pin: string }; Returns: Json };
      worldcup_apply_football_sync: {
        Args: { p_matches: Json; p_message: string; p_synced_at: string };
        Returns: number;
      };
      worldcup_is_admin: { Args: { p_pin: string }; Returns: boolean };
      worldcup_join: { Args: { p_name: string; p_pin: string }; Returns: Json };
      worldcup_public_state: {
        Args: { p_participant_id?: string; p_pin?: string };
        Returns: Json;
      };
      worldcup_save_prediction: {
        Args: {
          p_match_id: string;
          p_participant_id: string;
          p_pin: string;
          p_regular: string;
          p_team: string;
        };
        Returns: Json;
      };
      worldcup_touch: { Args: never; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
