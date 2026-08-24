export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.15" };
  public: {
    Tables: {
      what_should_eat_sessions: {
        Row: {
          created_at: string;
          expires_at: string;
          id: number;
          token_hash: string;
          user_id: number;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          id?: never;
          token_hash: string;
          user_id: number;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: never;
          token_hash?: string;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "what_should_eat_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "what_should_eat_users";
            referencedColumns: ["id"];
          },
        ];
      };
      what_should_eat_users: {
        Row: {
          birth_year: number;
          created_at: string;
          display_name: string;
          gender: string;
          id: number;
          login_id: string;
          pin_hash: string;
        };
        Insert: {
          birth_year: number;
          created_at?: string;
          display_name: string;
          gender: string;
          id?: never;
          login_id: string;
          pin_hash: string;
        };
        Update: {
          birth_year?: number;
          created_at?: string;
          display_name?: string;
          gender?: string;
          id?: never;
          login_id?: string;
          pin_hash?: string;
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
            referencedRelation: "what_should_eat_users";
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
            referencedRelation: "what_should_eat_users";
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
            referencedRelation: "what_should_eat_users";
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
            referencedRelation: "what_should_eat_users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
