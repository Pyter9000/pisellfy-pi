export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      badges: {
        Row: {
          audience: string
          code: string
          created_at: string
          criteria: Json
          description: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          audience?: string
          code: string
          created_at?: string
          criteria?: Json
          description?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          audience?: string
          code?: string
          created_at?: string
          criteria?: Json
          description?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      earnings: {
        Row: {
          buyer_id: string
          commission_rate: number
          created_at: string
          id: string
          payment_id: string | null
          payout_id: string | null
          payout_status: Database["public"]["Enums"]["payout_status"]
          platform_fee: number
          reference_id: string
          seller_earnings: number
          seller_id: string | null
          total_amount: number
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
        }
        Insert: {
          buyer_id: string
          commission_rate?: number
          created_at?: string
          id?: string
          payment_id?: string | null
          payout_id?: string | null
          payout_status?: Database["public"]["Enums"]["payout_status"]
          platform_fee: number
          reference_id: string
          seller_earnings: number
          seller_id?: string | null
          total_amount: number
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          commission_rate?: number
          created_at?: string
          id?: string
          payment_id?: string | null
          payout_id?: string | null
          payout_status?: Database["public"]["Enums"]["payout_status"]
          platform_fee?: number
          reference_id?: string
          seller_earnings?: number
          seller_id?: string | null
          total_amount?: number
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "earnings_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          audience: string
          code: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          metric: string
          period: Database["public"]["Enums"]["mission_period"]
          reward_badge_code: string | null
          reward_boost_hours: number
          reward_points: number
          reward_xp: number
          target: number
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          code: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          metric: string
          period?: Database["public"]["Enums"]["mission_period"]
          reward_badge_code?: string | null
          reward_boost_hours?: number
          reward_points?: number
          reward_xp?: number
          target?: number
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          code?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          metric?: string
          period?: Database["public"]["Enums"]["mission_period"]
          reward_badge_code?: string | null
          reward_boost_hours?: number
          reward_points?: number
          reward_xp?: number
          target?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_disputes: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          purchase_id: string
          reason: string
          resolution: string | null
          seller_id: string
          status: Database["public"]["Enums"]["dispute_state"]
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          purchase_id: string
          reason: string
          resolution?: string | null
          seller_id: string
          status?: Database["public"]["Enums"]["dispute_state"]
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          purchase_id?: string
          reason?: string
          resolution?: string | null
          seller_id?: string
          status?: Database["public"]["Enums"]["dispute_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_disputes_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: true
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_audit_log: {
        Row: {
          action: string
          amount: number | null
          created_at: string
          details: Json
          id: string
          payout_id: string | null
          seller_id: string | null
          success: boolean
        }
        Insert: {
          action: string
          amount?: number | null
          created_at?: string
          details?: Json
          id?: string
          payout_id?: string | null
          seller_id?: string | null
          success: boolean
        }
        Update: {
          action?: string
          amount?: number | null
          created_at?: string
          details?: Json
          id?: string
          payout_id?: string | null
          seller_id?: string | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payout_audit_log_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          memo: string
          pi_payment_id: string | null
          requested_at: string
          seller_id: string
          status: Database["public"]["Enums"]["payout_state"]
          txid: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          memo?: string
          pi_payment_id?: string | null
          requested_at?: string
          seller_id: string
          status?: Database["public"]["Enums"]["payout_state"]
          txid?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          memo?: string
          pi_payment_id?: string | null
          requested_at?: string
          seller_id?: string
          status?: Database["public"]["Enums"]["payout_state"]
          txid?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      points_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          reason: string
          source_id: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number
          created_at?: string
          id?: string
          reason: string
          source_id?: string | null
          source_type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          reason?: string
          source_id?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          pi_uid: string
          pi_username: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          pi_uid: string
          pi_username: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          pi_uid?: string
          pi_username?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          amount: number
          created_at: string
          id: string
          memo: string
          metadata: Json
          payment_id: string
          product_id: string
          product_title: string
          seller_id: string | null
          status: string
          txid: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          memo: string
          metadata?: Json
          payment_id: string
          product_id: string
          product_title: string
          seller_id?: string | null
          status?: string
          txid?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          memo?: string
          metadata?: Json
          payment_id?: string
          product_id?: string
          product_title?: string
          seller_id?: string | null
          status?: string
          txid?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reward_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      reward_fraud_flags: {
        Row: {
          created_at: string
          details: Json
          id: string
          kind: string
          resolved: boolean
          severity: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          kind: string
          resolved?: boolean
          severity?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          resolved?: boolean
          severity?: string
          user_id?: string | null
        }
        Relationships: []
      }
      seller_balances: {
        Row: {
          available_balance: number
          created_at: string
          minimum_payout: number
          pending_balance: number
          seller_id: string
          total_earned: number
          total_withdrawn: number
          updated_at: string
        }
        Insert: {
          available_balance?: number
          created_at?: string
          minimum_payout?: number
          pending_balance?: number
          seller_id: string
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string
        }
        Update: {
          available_balance?: number
          created_at?: string
          minimum_payout?: number
          pending_balance?: number
          seller_id?: string
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string
        }
        Relationships: []
      }
      seller_boosts: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          paid_with: string
          pi_amount: number
          pi_payment_id: string | null
          points_spent: number
          seller_id: string
          starts_at: string
          status: Database["public"]["Enums"]["boost_state"]
          target_id: string
          target_label: string
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          paid_with?: string
          pi_amount?: number
          pi_payment_id?: string | null
          points_spent?: number
          seller_id: string
          starts_at?: string
          status?: Database["public"]["Enums"]["boost_state"]
          target_id: string
          target_label?: string
          target_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          paid_with?: string
          pi_amount?: number
          pi_payment_id?: string | null
          points_spent?: number
          seller_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["boost_state"]
          target_id?: string
          target_label?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      seller_level_requirements: {
        Row: {
          benefits: Json
          created_at: string
          id: string
          is_active: boolean
          label: string
          level: Database["public"]["Enums"]["sellfy_level"]
          manual_review_required: boolean
          maximum_cancellation_rate: number
          maximum_dispute_rate: number
          minimum_account_age_days: number
          minimum_orders: number
          minimum_rating: number
          minimum_response_rate: number
          minimum_reviews: number
          minimum_success_score: number
          updated_at: string
        }
        Insert: {
          benefits?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          level: Database["public"]["Enums"]["sellfy_level"]
          manual_review_required?: boolean
          maximum_cancellation_rate?: number
          maximum_dispute_rate?: number
          minimum_account_age_days?: number
          minimum_orders?: number
          minimum_rating?: number
          minimum_response_rate?: number
          minimum_reviews?: number
          minimum_success_score?: number
          updated_at?: string
        }
        Update: {
          benefits?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          level?: Database["public"]["Enums"]["sellfy_level"]
          manual_review_required?: boolean
          maximum_cancellation_rate?: number
          maximum_dispute_rate?: number
          minimum_account_age_days?: number
          minimum_orders?: number
          minimum_rating?: number
          minimum_response_rate?: number
          minimum_reviews?: number
          minimum_success_score?: number
          updated_at?: string
        }
        Relationships: []
      }
      seller_levels: {
        Row: {
          calculated_at: string
          created_at: string
          downgrade_warned_at: string | null
          eligible_level: Database["public"]["Enums"]["sellfy_level"]
          level: Database["public"]["Enums"]["sellfy_level"]
          level_since: string
          next_best_actions: Json
          pending_manual_review: boolean
          progress: Json
          seller_id: string
          under_watch: boolean
          updated_at: string
          watch_started_at: string | null
        }
        Insert: {
          calculated_at?: string
          created_at?: string
          downgrade_warned_at?: string | null
          eligible_level?: Database["public"]["Enums"]["sellfy_level"]
          level?: Database["public"]["Enums"]["sellfy_level"]
          level_since?: string
          next_best_actions?: Json
          pending_manual_review?: boolean
          progress?: Json
          seller_id: string
          under_watch?: boolean
          updated_at?: string
          watch_started_at?: string | null
        }
        Update: {
          calculated_at?: string
          created_at?: string
          downgrade_warned_at?: string | null
          eligible_level?: Database["public"]["Enums"]["sellfy_level"]
          level?: Database["public"]["Enums"]["sellfy_level"]
          level_since?: string
          next_best_actions?: Json
          pending_manual_review?: boolean
          progress?: Json
          seller_id?: string
          under_watch?: boolean
          updated_at?: string
          watch_started_at?: string | null
        }
        Relationships: []
      }
      seller_performance: {
        Row: {
          average_rating: number
          calculated_at: string
          cancellation_rate: number
          communication_score: number
          created_at: string
          data_sufficient: boolean
          dispute_rate: number
          order_completion_score: number
          quality_score: number
          reliability_score: number
          response_score: number
          review_score: number
          reviews_count: number
          seller_id: string
          success_score: number
          updated_at: string
        }
        Insert: {
          average_rating?: number
          calculated_at?: string
          cancellation_rate?: number
          communication_score?: number
          created_at?: string
          data_sufficient?: boolean
          dispute_rate?: number
          order_completion_score?: number
          quality_score?: number
          reliability_score?: number
          response_score?: number
          review_score?: number
          reviews_count?: number
          seller_id: string
          success_score?: number
          updated_at?: string
        }
        Update: {
          average_rating?: number
          calculated_at?: string
          cancellation_rate?: number
          communication_score?: number
          created_at?: string
          data_sufficient?: boolean
          dispute_rate?: number
          order_completion_score?: number
          quality_score?: number
          reliability_score?: number
          response_score?: number
          review_score?: number
          reviews_count?: number
          seller_id?: string
          success_score?: number
          updated_at?: string
        }
        Relationships: []
      }
      seller_reputation: {
        Row: {
          calculated_at: string
          created_at: string
          fast_responder: boolean
          public_orders_completed: number
          public_rating: number
          reliable_seller: boolean
          reputation_score: number
          seller_id: string
          updated_at: string
        }
        Insert: {
          calculated_at?: string
          created_at?: string
          fast_responder?: boolean
          public_orders_completed?: number
          public_rating?: number
          reliable_seller?: boolean
          reputation_score?: number
          seller_id: string
          updated_at?: string
        }
        Update: {
          calculated_at?: string
          created_at?: string
          fast_responder?: boolean
          public_orders_completed?: number
          public_rating?: number
          reliable_seller?: boolean
          reputation_score?: number
          seller_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      seller_reviews: {
        Row: {
          buyer_id: string
          comment: string
          created_at: string
          id: string
          purchase_id: string
          rating: number
          seller_id: string
          updated_at: string
        }
        Insert: {
          buyer_id: string
          comment?: string
          created_at?: string
          id?: string
          purchase_id: string
          rating: number
          seller_id: string
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          comment?: string
          created_at?: string
          id?: string
          purchase_id?: string
          rating?: number
          seller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_reviews_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: true
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_stats: {
        Row: {
          created_at: string
          first_sale_at: string | null
          inquiries_answered: number
          inquiries_received: number
          late_deliveries: number
          orders_cancelled: number
          orders_completed: number
          seller_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_sale_at?: string | null
          inquiries_answered?: number
          inquiries_received?: number
          late_deliveries?: number
          orders_cancelled?: number
          orders_completed?: number
          seller_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_sale_at?: string | null
          inquiries_answered?: number
          inquiries_received?: number
          late_deliveries?: number
          orders_cancelled?: number
          orders_completed?: number
          seller_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sellfy_club_memberships: {
        Row: {
          benefits: Json
          created_at: string
          ends_at: string | null
          id: string
          is_active: boolean
          seller_id: string
          started_at: string
          subscription_id: string | null
          tier: Database["public"]["Enums"]["club_tier"]
          updated_at: string
        }
        Insert: {
          benefits?: Json
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          seller_id: string
          started_at?: string
          subscription_id?: string | null
          tier?: Database["public"]["Enums"]["club_tier"]
          updated_at?: string
        }
        Update: {
          benefits?: Json
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          seller_id?: string
          started_at?: string
          subscription_id?: string | null
          tier?: Database["public"]["Enums"]["club_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sellfy_club_memberships_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          payment_id: string | null
          period_end: string
          period_start: string
          status: string
          subscriber_id: string
          subscription_id: string
          txid: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payment_id?: string | null
          period_end: string
          period_start?: string
          status?: string
          subscriber_id: string
          subscription_id: string
          txid?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payment_id?: string | null
          period_end?: string
          period_start?: string
          status?: string
          subscriber_id?: string
          subscription_id?: string
          txid?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          benefits: Json
          created_at: string
          description: string
          id: string
          included_content: Json
          interval: Database["public"]["Enums"]["billing_interval"]
          is_active: boolean
          name: string
          price: number
          seller_id: string
          tier: string
          updated_at: string
        }
        Insert: {
          benefits?: Json
          created_at?: string
          description?: string
          id?: string
          included_content?: Json
          interval?: Database["public"]["Enums"]["billing_interval"]
          is_active?: boolean
          name: string
          price: number
          seller_id: string
          tier?: string
          updated_at?: string
        }
        Update: {
          benefits?: Json
          created_at?: string
          description?: string
          id?: string
          included_content?: Json
          interval?: Database["public"]["Enums"]["billing_interval"]
          is_active?: boolean
          name?: string
          price?: number
          seller_id?: string
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          next_billing_at: string
          pi_contract_id: string | null
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          subscriber_id: string
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          next_billing_at?: string
          pi_contract_id?: string | null
          plan_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          subscriber_id: string
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          next_billing_at?: string
          pi_contract_id?: string | null
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          subscriber_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          awarded_at: string
          badge_id: string
          id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          badge_id: string
          id?: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          badge_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_missions: {
        Row: {
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          mission_id: string
          period_key: string
          progress: number
          status: Database["public"]["Enums"]["mission_state"]
          updated_at: string
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          mission_id: string
          period_key: string
          progress?: number
          status?: Database["public"]["Enums"]["mission_state"]
          updated_at?: string
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          mission_id?: string
          period_key?: string
          progress?: number
          status?: Database["public"]["Enums"]["mission_state"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_missions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_rewards: {
        Row: {
          buyer_level: number
          created_at: string
          orders_placed: number
          points_balance: number
          points_lifetime: number
          updated_at: string
          user_id: string
          xp_total: number
        }
        Insert: {
          buyer_level?: number
          created_at?: string
          orders_placed?: number
          points_balance?: number
          points_lifetime?: number
          updated_at?: string
          user_id: string
          xp_total?: number
        }
        Update: {
          buyer_level?: number
          created_at?: string
          orders_placed?: number
          points_balance?: number
          points_lifetime?: number
          updated_at?: string
          user_id?: string
          xp_total?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      xp_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string
          source_id: string | null
          source_type: string
          total_after: number
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason: string
          source_id?: string | null
          source_type: string
          total_after?: number
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          source_id?: string | null
          source_type?: string
          total_after?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      billing_interval: "weekly" | "monthly" | "yearly"
      boost_state: "active" | "expired" | "cancelled"
      club_tier: "standard" | "pro"
      dispute_state: "open" | "resolved" | "rejected"
      mission_period: "daily" | "weekly" | "monthly" | "special"
      mission_state: "in_progress" | "completed" | "claimed" | "expired"
      payout_state:
        | "pending"
        | "approved"
        | "completed"
        | "failed"
        | "cancelled"
      payout_status: "unpaid" | "processing" | "paid"
      reward_currency: "points" | "xp"
      sellfy_level: "level_0" | "level_1" | "level_2" | "level_3"
      subscription_status:
        | "active"
        | "past_due"
        | "canceled"
        | "expired"
        | "pending"
      transaction_type: "product" | "service" | "course" | "subscription"
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
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      billing_interval: ["weekly", "monthly", "yearly"],
      boost_state: ["active", "expired", "cancelled"],
      club_tier: ["standard", "pro"],
      dispute_state: ["open", "resolved", "rejected"],
      mission_period: ["daily", "weekly", "monthly", "special"],
      mission_state: ["in_progress", "completed", "claimed", "expired"],
      payout_state: ["pending", "approved", "completed", "failed", "cancelled"],
      payout_status: ["unpaid", "processing", "paid"],
      reward_currency: ["points", "xp"],
      sellfy_level: ["level_0", "level_1", "level_2", "level_3"],
      subscription_status: [
        "active",
        "past_due",
        "canceled",
        "expired",
        "pending",
      ],
      transaction_type: ["product", "service", "course", "subscription"],
    },
  },
} as const
