export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      debts: {
        Row: {
          created_at: string
          created_by: string
          currency: string
          debtor_id: string
          description: string | null
          due_day: number
          id: string
          installment_amount_minor: number
          start_month: string
          status: string
          total_amount_minor: number
          total_installments: number
        }
        Insert: {
          created_at?: string
          created_by: string
          currency: string
          debtor_id: string
          description?: string | null
          due_day: number
          id?: string
          installment_amount_minor: number
          start_month: string
          status?: string
          total_amount_minor: number
          total_installments: number
        }
        Update: {
          created_at?: string
          created_by?: string
          currency?: string
          debtor_id?: string
          description?: string | null
          due_day?: number
          id?: string
          installment_amount_minor?: number
          start_month?: string
          status?: string
          total_amount_minor?: number
          total_installments?: number
        }
        Relationships: [
          {
            foreignKeyName: "debts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      installments: {
        Row: {
          amount_minor: number
          created_at: string
          debt_id: string
          due_date: string
          id: string
          remaining_amount_minor: number
          sequence_number: number
          status: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          debt_id: string
          due_date: string
          id?: string
          remaining_amount_minor: number
          sequence_number: number
          status?: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          debt_id?: string
          due_date?: string
          id?: string
          remaining_amount_minor?: number
          sequence_number?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "installments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
        ]
      }
      interest_accruals: {
        Row: {
          accrued_amount_minor: number
          closing_balance_minor: number
          created_at: string
          id: string
          interest_debt_id: string
          mode: string
          opening_balance_minor: number
          period: string
        }
        Insert: {
          accrued_amount_minor: number
          closing_balance_minor: number
          created_at?: string
          id?: string
          interest_debt_id: string
          mode?: string
          opening_balance_minor: number
          period: string
        }
        Update: {
          accrued_amount_minor?: number
          closing_balance_minor?: number
          created_at?: string
          id?: string
          interest_debt_id?: string
          mode?: string
          opening_balance_minor?: number
          period?: string
        }
        Relationships: [
          {
            foreignKeyName: "interest_accruals_interest_debt_id_fkey"
            columns: ["interest_debt_id"]
            isOneToOne: false
            referencedRelation: "interest_debts"
            referencedColumns: ["id"]
          },
        ]
      }
      interest_debts: {
        Row: {
          created_at: string
          current_balance_minor: number
          debt_id: string
          id: string
          interest_rate: string
          is_simulated: boolean
          mirror_of: string | null
          principal_minor: number
          source_installment_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          current_balance_minor: number
          debt_id: string
          id?: string
          interest_rate: string
          is_simulated?: boolean
          mirror_of?: string | null
          principal_minor: number
          source_installment_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          current_balance_minor?: number
          debt_id?: string
          id?: string
          interest_rate?: string
          is_simulated?: boolean
          mirror_of?: string | null
          principal_minor?: number
          source_installment_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "interest_debts_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_debts_mirror_of_fkey"
            columns: ["mirror_of"]
            isOneToOne: false
            referencedRelation: "interest_debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_debts_source_installment_id_fkey"
            columns: ["source_installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          inviter_id: string
          token: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          inviter_id: string
          token: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          inviter_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_applications: {
        Row: {
          applied_amount_minor: number
          created_at: string
          id: string
          payment_id: string
          target_id: string
          target_type: string
        }
        Insert: {
          applied_amount_minor: number
          created_at?: string
          id?: string
          payment_id: string
          target_id: string
          target_type: string
        }
        Update: {
          applied_amount_minor?: number
          created_at?: string
          id?: string
          payment_id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_applications_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_minor: number
          applied_at: string | null
          created_at: string
          created_by: string
          currency: string
          debtor_id: string
          id: string
          notes: string | null
          status: string
        }
        Insert: {
          amount_minor: number
          applied_at?: string | null
          created_at?: string
          created_by: string
          currency: string
          debtor_id: string
          id?: string
          notes?: string | null
          status?: string
        }
        Update: {
          amount_minor?: number
          applied_at?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          debtor_id?: string
          id?: string
          notes?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_simulation_overrides: {
        Row: {
          simulated_annual_rate: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          simulated_annual_rate: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          simulated_annual_rate?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_simulation_overrides_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_simulation_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          invited_by?: string | null
          role: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: {
        Args: { p_email: string; p_token: string; p_user_id: string }
        Returns: Json
      }
      // added manually; regenerate with: npx supabase gen types
      apply_payment: {
        Args: { p_payment_id: string }
        Returns: Json
      }
      create_debt_with_installments: {
        Args: {
          p_created_by: string
          p_currency: string
          p_debtor_id: string
          p_description: string | null
          p_due_day: number
          p_installment_amount_minor: number
          p_start_month: string
          p_total_amount_minor: number
          p_total_installments: number
        }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

