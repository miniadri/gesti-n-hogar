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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          metadata: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          metadata?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      appliances: {
        Row: {
          created_at: string
          household_id: string
          id: string
          is_default: boolean
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          is_default?: boolean
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          is_default?: boolean
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appliances_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          household_id: string
          id: string
          period: string
          start_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          household_id: string
          id?: string
          period?: string
          start_date?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          household_id?: string
          id?: string
          period?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          attendees: string[] | null
          category: string | null
          created_at: string
          created_by: string
          description: string | null
          end_at: string | null
          external_id: string | null
          google_calendar_id: string | null
          google_event_etag: string | null
          household_id: string
          id: string
          is_public: boolean
          notified_at: string | null
          source: string
          start_at: string
          title: string
          updated_at: string
        }
        Insert: {
          attendees?: string[] | null
          category?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_at?: string | null
          external_id?: string | null
          google_calendar_id?: string | null
          google_event_etag?: string | null
          household_id: string
          id?: string
          is_public?: boolean
          notified_at?: string | null
          source?: string
          start_at: string
          title: string
          updated_at?: string
        }
        Update: {
          attendees?: string[] | null
          category?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_at?: string | null
          external_id?: string | null
          google_calendar_id?: string | null
          google_event_etag?: string | null
          household_id?: string
          id?: string
          is_public?: boolean
          notified_at?: string | null
          source?: string
          start_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      device_schedules: {
        Row: {
          action: string
          day_of_week: number
          device_id: string
          enabled: boolean
          id: string
          time: string
        }
        Insert: {
          action: string
          day_of_week: number
          device_id: string
          enabled?: boolean
          id?: string
          time: string
        }
        Update: {
          action?: string
          day_of_week?: number
          device_id?: string
          enabled?: boolean
          id?: string
          time?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_schedules_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          attributes: Json
          created_at: string
          domain: string | null
          external_id: string | null
          external_source: string | null
          hidden: boolean
          household_id: string
          id: string
          last_state_at: string | null
          name: string
          next_maintenance: string | null
          quick_access: boolean
          room: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          created_at?: string
          domain?: string | null
          external_id?: string | null
          external_source?: string | null
          hidden?: boolean
          household_id: string
          id?: string
          last_state_at?: string | null
          name: string
          next_maintenance?: string | null
          quick_access?: boolean
          room?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          created_at?: string
          domain?: string | null
          external_id?: string | null
          external_source?: string | null
          hidden?: boolean
          household_id?: string
          id?: string
          last_state_at?: string | null
          name?: string
          next_maintenance?: string | null
          quick_access?: boolean
          room?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          created_at: string
          household_id: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          telegram_chat_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          color: string | null
          created_at: string
          household_id: string
          icon: string | null
          id: string
          is_default: boolean
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          household_id: string
          icon?: string | null
          id?: string
          is_default?: boolean
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          household_id?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          created_by: string
          date: string
          description: string | null
          household_id: string
          id: string
          is_subscription: boolean
          paid_by: string | null
          receipt_id: string | null
          recurrence: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          created_by: string
          date?: string
          description?: string | null
          household_id: string
          id?: string
          is_subscription?: boolean
          paid_by?: string | null
          receipt_id?: string | null
          recurrence?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by?: string
          date?: string
          description?: string | null
          household_id?: string
          id?: string
          is_subscription?: boolean
          paid_by?: string | null
          receipt_id?: string | null
          recurrence?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      home_assistant_connections: {
        Row: {
          base_url: string
          created_at: string
          household_id: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          status: string
          token_ciphertext: string
          updated_at: string
        }
        Insert: {
          base_url: string
          created_at?: string
          household_id: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          status?: string
          token_ciphertext: string
          updated_at?: string
        }
        Update: {
          base_url?: string
          created_at?: string
          household_id?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          status?: string
          token_ciphertext?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_assistant_connections_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_activity: {
        Row: {
          action: string
          actor_user_id: string
          channel: string | null
          created_at: string
          details: string | null
          domain: string
          entity_id: string | null
          entity_type: string | null
          household_id: string
          id: string
          metadata: Json
          status: string | null
          title: string
        }
        Insert: {
          action: string
          actor_user_id: string
          channel?: string | null
          created_at?: string
          details?: string | null
          domain: string
          entity_id?: string | null
          entity_type?: string | null
          household_id: string
          id?: string
          metadata?: Json
          status?: string | null
          title: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          channel?: string | null
          created_at?: string
          details?: string | null
          domain?: string
          entity_id?: string | null
          entity_type?: string | null
          household_id?: string
          id?: string
          metadata?: Json
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_activity_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_activity_reviews: {
        Row: {
          created_at: string
          household_id: string
          id: string
          item_key: string
          reviewed_at: string
          reviewed_by: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          item_key: string
          reviewed_at?: string
          reviewed_by: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          item_key?: string
          reviewed_at?: string
          reviewed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_activity_reviews_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string
          household_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at?: string
          household_id: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          household_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          household_id: string
          id: string
          is_child: boolean
          is_emergency_contact: boolean
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          household_id: string
          id?: string
          is_child?: boolean
          is_emergency_contact?: boolean
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          household_id?: string
          id?: string
          is_child?: boolean
          is_emergency_contact?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string
          critical_threshold_percent: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          critical_threshold_percent?: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          critical_threshold_percent?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          category: string | null
          created_at: string
          ean: string | null
          expiry_date: string | null
          expiry_notified_at: string | null
          household_id: string
          id: string
          image_url: string | null
          last_price: number | null
          location: string | null
          mercadona_id: string | null
          min_stock: number | null
          name: string
          quantity: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          ean?: string | null
          expiry_date?: string | null
          expiry_notified_at?: string | null
          household_id: string
          id?: string
          image_url?: string | null
          last_price?: number | null
          location?: string | null
          mercadona_id?: string | null
          min_stock?: number | null
          name: string
          quantity?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          ean?: string | null
          expiry_date?: string | null
          expiry_notified_at?: string | null
          household_id?: string
          id?: string
          image_url?: string | null
          last_price?: number | null
          location?: string | null
          mercadona_id?: string | null
          min_stock?: number | null
          name?: string
          quantity?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_ean_fkey"
            columns: ["ean"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["ean"]
          },
          {
            foreignKeyName: "inventory_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_cards: {
        Row: {
          back_image_url: string | null
          barcode: string | null
          barcode_format: string | null
          card_number: string | null
          color: string | null
          created_at: string
          front_image_url: string | null
          household_id: string | null
          id: string
          is_favorite: boolean
          is_shared: boolean
          last_used_at: string | null
          merchant: string
          notes: string | null
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          back_image_url?: string | null
          barcode?: string | null
          barcode_format?: string | null
          card_number?: string | null
          color?: string | null
          created_at?: string
          front_image_url?: string | null
          household_id?: string | null
          id?: string
          is_favorite?: boolean
          is_shared?: boolean
          last_used_at?: string | null
          merchant: string
          notes?: string | null
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          back_image_url?: string | null
          barcode?: string | null
          barcode_format?: string | null
          card_number?: string | null
          color?: string | null
          created_at?: string
          front_image_url?: string | null
          household_id?: string | null
          id?: string
          is_favorite?: boolean
          is_shared?: boolean
          last_used_at?: string | null
          merchant?: string
          notes?: string | null
          updated_at?: string
          use_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_cards_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_days: {
        Row: {
          breakfast_recipe_id: string | null
          day_of_week: number
          dinner_locked: boolean
          dinner_manual: string | null
          dinner_recipe_id: string | null
          dinner_skipped: boolean
          id: string
          lunch_locked: boolean
          lunch_manual: string | null
          lunch_recipe_id: string | null
          lunch_skipped: boolean
          meal_plan_id: string
          servings: number
          snack_recipe_id: string | null
        }
        Insert: {
          breakfast_recipe_id?: string | null
          day_of_week: number
          dinner_locked?: boolean
          dinner_manual?: string | null
          dinner_recipe_id?: string | null
          dinner_skipped?: boolean
          id?: string
          lunch_locked?: boolean
          lunch_manual?: string | null
          lunch_recipe_id?: string | null
          lunch_skipped?: boolean
          meal_plan_id: string
          servings?: number
          snack_recipe_id?: string | null
        }
        Update: {
          breakfast_recipe_id?: string | null
          day_of_week?: number
          dinner_locked?: boolean
          dinner_manual?: string | null
          dinner_recipe_id?: string | null
          dinner_skipped?: boolean
          id?: string
          lunch_locked?: boolean
          lunch_manual?: string | null
          lunch_recipe_id?: string | null
          lunch_skipped?: boolean
          meal_plan_id?: string
          servings?: number
          snack_recipe_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_days_breakfast_recipe_id_fkey"
            columns: ["breakfast_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_days_dinner_recipe_id_fkey"
            columns: ["dinner_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_days_lunch_recipe_id_fkey"
            columns: ["lunch_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_days_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_days_snack_recipe_id_fkey"
            columns: ["snack_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          created_at: string
          household_id: string
          id: string
          notes: string | null
          updated_at: string
          week_start: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          notes?: string | null
          updated_at?: string
          week_start: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          notes?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_profiles: {
        Row: {
          blood_type: string | null
          created_at: string
          emergency_notes: string | null
          height_cm: number | null
          household_id: string
          id: string
          member_id: string
          private_coverage_notes: string | null
          private_insurance_name: string | null
          private_policy_number: string | null
          public_health_id: string | null
          public_health_provider: string | null
          show_in_sos: boolean
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          blood_type?: string | null
          created_at?: string
          emergency_notes?: string | null
          height_cm?: number | null
          household_id: string
          id?: string
          member_id: string
          private_coverage_notes?: string | null
          private_insurance_name?: string | null
          private_policy_number?: string | null
          public_health_id?: string | null
          public_health_provider?: string | null
          show_in_sos?: boolean
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          blood_type?: string | null
          created_at?: string
          emergency_notes?: string | null
          height_cm?: number | null
          household_id?: string
          id?: string
          member_id?: string
          private_coverage_notes?: string | null
          private_insurance_name?: string | null
          private_policy_number?: string | null
          public_health_id?: string | null
          public_health_provider?: string | null
          show_in_sos?: boolean
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_profiles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_profiles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_records: {
        Row: {
          created_at: string
          created_by: string | null
          follow_up_on: string | null
          household_id: string
          id: string
          member_id: string
          notes: string | null
          occurred_on: string | null
          record_type: string
          severity: string | null
          show_in_sos: boolean
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          follow_up_on?: string | null
          household_id: string
          id?: string
          member_id: string
          notes?: string | null
          occurred_on?: string | null
          record_type: string
          severity?: string | null
          show_in_sos?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          follow_up_on?: string | null
          household_id?: string
          id?: string
          member_id?: string
          notes?: string | null
          occurred_on?: string | null
          record_type?: string
          severity?: string | null
          show_in_sos?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_records_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_records_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_intakes: {
        Row: {
          confirmed_by: string | null
          created_at: string
          escalated_at: string | null
          id: string
          last_reminder_sent_at: string | null
          medication_id: string
          reminder_count: number
          schedule_id: string | null
          scheduled_for: string
          status: Database["public"]["Enums"]["medication_intake_status"]
          taken_at: string | null
          updated_at: string
        }
        Insert: {
          confirmed_by?: string | null
          created_at?: string
          escalated_at?: string | null
          id?: string
          last_reminder_sent_at?: string | null
          medication_id: string
          reminder_count?: number
          schedule_id?: string | null
          scheduled_for: string
          status?: Database["public"]["Enums"]["medication_intake_status"]
          taken_at?: string | null
          updated_at?: string
        }
        Update: {
          confirmed_by?: string | null
          created_at?: string
          escalated_at?: string | null
          id?: string
          last_reminder_sent_at?: string | null
          medication_id?: string
          reminder_count?: number
          schedule_id?: string | null
          scheduled_for?: string
          status?: Database["public"]["Enums"]["medication_intake_status"]
          taken_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_intakes_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_intakes_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "medication_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_schedules: {
        Row: {
          active: boolean
          created_at: string
          days_of_week: number[]
          frequency_type: string
          id: string
          interval_hours: number | null
          medication_id: string
          time_of_day: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          days_of_week?: number[]
          frequency_type?: string
          id?: string
          interval_hours?: number | null
          medication_id: string
          time_of_day: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          days_of_week?: number[]
          frequency_type?: string
          id?: string
          interval_hours?: number | null
          medication_id?: string
          time_of_day?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_schedules_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
        ]
      }
      medications: {
        Row: {
          cima_active_ingredients: string[]
          cima_cn: string | null
          cima_excipients: string[]
          cima_ficha_tecnica_url: string | null
          cima_name: string | null
          cima_nregistro: string | null
          cima_prescription_required: boolean | null
          cima_prospect_url: string | null
          cima_url: string | null
          created_at: string
          created_by: string
          current_quantity: number | null
          doctor_instructions: string | null
          dose_amount: number
          escalation_after_minutes: number | null
          form: Database["public"]["Enums"]["medication_form"]
          household_id: string
          id: string
          low_stock_threshold: number | null
          member_id: string
          name: string
          notes: string | null
          reminders_enabled: boolean
          timezone: string
          total_quantity: number | null
          unit: string
          updated_at: string
        }
        Insert: {
          cima_active_ingredients?: string[]
          cima_cn?: string | null
          cima_excipients?: string[]
          cima_ficha_tecnica_url?: string | null
          cima_name?: string | null
          cima_nregistro?: string | null
          cima_prescription_required?: boolean | null
          cima_prospect_url?: string | null
          cima_url?: string | null
          created_at?: string
          created_by: string
          current_quantity?: number | null
          doctor_instructions?: string | null
          dose_amount?: number
          escalation_after_minutes?: number | null
          form?: Database["public"]["Enums"]["medication_form"]
          household_id: string
          id?: string
          low_stock_threshold?: number | null
          member_id: string
          name: string
          notes?: string | null
          reminders_enabled?: boolean
          timezone?: string
          total_quantity?: number | null
          unit?: string
          updated_at?: string
        }
        Update: {
          cima_active_ingredients?: string[]
          cima_cn?: string | null
          cima_excipients?: string[]
          cima_ficha_tecnica_url?: string | null
          cima_name?: string | null
          cima_nregistro?: string | null
          cima_prescription_required?: boolean | null
          cima_prospect_url?: string | null
          cima_url?: string | null
          created_at?: string
          created_by?: string
          current_quantity?: number | null
          doctor_instructions?: string | null
          dose_amount?: number
          escalation_after_minutes?: number | null
          form?: Database["public"]["Enums"]["medication_form"]
          household_id?: string
          id?: string
          low_stock_threshold?: number | null
          member_id?: string
          name?: string
          notes?: string | null
          reminders_enabled?: boolean
          timezone?: string
          total_quantity?: number | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medications_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      medicines: {
        Row: {
          created_at: string
          current_quantity: number | null
          dose_amount: number | null
          expiry_month: number | null
          expiry_notified_at: string | null
          expiry_year: number | null
          form: Database["public"]["Enums"]["medication_form"] | null
          household_id: string
          id: string
          low_stock_threshold: number | null
          name: string
          needs_purchase: boolean
          note: string | null
          notes: string | null
          total_quantity: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_quantity?: number | null
          dose_amount?: number | null
          expiry_month?: number | null
          expiry_notified_at?: string | null
          expiry_year?: number | null
          form?: Database["public"]["Enums"]["medication_form"] | null
          household_id: string
          id?: string
          low_stock_threshold?: number | null
          name: string
          needs_purchase?: boolean
          note?: string | null
          notes?: string | null
          total_quantity?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_quantity?: number | null
          dose_amount?: number | null
          expiry_month?: number | null
          expiry_notified_at?: string | null
          expiry_year?: number | null
          form?: Database["public"]["Enums"]["medication_form"] | null
          household_id?: string
          id?: string
          low_stock_threshold?: number | null
          name?: string
          needs_purchase?: boolean
          note?: string | null
          notes?: string | null
          total_quantity?: number | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicines_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      mercadona_price_history: {
        Row: {
          bulk_price: number | null
          captured_on: string
          created_at: string
          id: string
          product_id: string
          unit_price: number | null
        }
        Insert: {
          bulk_price?: number | null
          captured_on?: string
          created_at?: string
          id?: string
          product_id: string
          unit_price?: number | null
        }
        Update: {
          bulk_price?: number | null
          captured_on?: string
          created_at?: string
          id?: string
          product_id?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mercadona_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mercadona_products"
            referencedColumns: ["id"]
          },
        ]
      }
      mercadona_products: {
        Row: {
          brand: string | null
          bulk_price: number | null
          category: string | null
          display_name: string
          ean: string | null
          id: string
          is_pack: boolean | null
          last_seen_at: string
          packaging: string | null
          reference_format: string | null
          reference_price: number | null
          share_url: string | null
          slug: string | null
          thumbnail: string | null
          unit_name: string | null
          unit_price: number | null
          unit_size: number | null
          updated_at: string
        }
        Insert: {
          brand?: string | null
          bulk_price?: number | null
          category?: string | null
          display_name: string
          ean?: string | null
          id: string
          is_pack?: boolean | null
          last_seen_at?: string
          packaging?: string | null
          reference_format?: string | null
          reference_price?: number | null
          share_url?: string | null
          slug?: string | null
          thumbnail?: string | null
          unit_name?: string | null
          unit_price?: number | null
          unit_size?: number | null
          updated_at?: string
        }
        Update: {
          brand?: string | null
          bulk_price?: number | null
          category?: string | null
          display_name?: string
          ean?: string | null
          id?: string
          is_pack?: boolean | null
          last_seen_at?: string
          packaging?: string | null
          reference_format?: string | null
          reference_price?: number | null
          share_url?: string | null
          slug?: string | null
          thumbnail?: string | null
          unit_name?: string | null
          unit_price?: number | null
          unit_size?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      merchant_suggestions: {
        Row: {
          created_at: string
          id: string
          merchant_name: string
          notes: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_name: string
          notes?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          merchant_name?: string
          notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json | null
          household_id: string
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json | null
          household_id: string
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json | null
          household_id?: string
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          created_at: string
          household_id: string
          id: string
          last_price: number | null
          last_quantity: number | null
          last_seen_at: string
          last_unit: string | null
          price_per_kg: number | null
          product_ean: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          last_price?: number | null
          last_quantity?: number | null
          last_seen_at?: string
          last_unit?: string | null
          price_per_kg?: number | null
          product_ean: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          last_price?: number | null
          last_quantity?: number | null
          last_seen_at?: string
          last_unit?: string | null
          price_per_kg?: number | null
          product_ean?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_product_ean_fkey"
            columns: ["product_ean"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["ean"]
          },
          {
            foreignKeyName: "product_prices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category: string | null
          created_at: string
          created_by: string | null
          default_location: string | null
          ean: string
          image_url: string | null
          name: string
          size_unit: string | null
          size_value: number | null
          updated_at: string
        }
        Insert: {
          brand?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          default_location?: string | null
          ean: string
          image_url?: string | null
          name: string
          size_unit?: string | null
          size_value?: number | null
          updated_at?: string
        }
        Update: {
          brand?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          default_location?: string | null
          ean?: string
          image_url?: string | null
          name?: string
          size_unit?: string | null
          size_value?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          google_sync_hours: number[]
          id: string
          preferred_currency: string
          preferred_language: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          google_sync_hours?: number[]
          id: string
          preferred_currency?: string
          preferred_language?: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          google_sync_hours?: number[]
          id?: string
          preferred_currency?: string
          preferred_language?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      receipt_items: {
        Row: {
          category: string | null
          id: string
          name: string
          quantity: number
          receipt_id: string
          total_price: number | null
          unit_price: number | null
        }
        Insert: {
          category?: string | null
          id?: string
          name: string
          quantity?: number
          receipt_id: string
          total_price?: number | null
          unit_price?: number | null
        }
        Update: {
          category?: string | null
          id?: string
          name?: string
          quantity?: number
          receipt_id?: string
          total_price?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          created_at: string
          created_by: string
          household_id: string
          id: string
          image_deleted_at: string | null
          image_path: string | null
          image_url: string | null
          receipt_date: string | null
          status: string
          store_id: string | null
          total: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          household_id: string
          id?: string
          image_deleted_at?: string | null
          image_path?: string | null
          image_url?: string | null
          receipt_date?: string | null
          status?: string
          store_id?: string | null
          total?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          household_id?: string
          id?: string
          image_deleted_at?: string | null
          image_path?: string | null
          image_url?: string | null
          receipt_date?: string | null
          status?: string
          store_id?: string | null
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          id: string
          is_optional: boolean
          name: string
          quantity: number | null
          recipe_id: string
          unit: string | null
        }
        Insert: {
          id?: string
          is_optional?: boolean
          name: string
          quantity?: number | null
          recipe_id: string
          unit?: string | null
        }
        Update: {
          id?: string
          is_optional?: boolean
          name?: string
          quantity?: number | null
          recipe_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_step_appliance_times: {
        Row: {
          appliance_type: string
          created_at: string
          id: string
          minutes: number
          step_id: string
        }
        Insert: {
          appliance_type: string
          created_at?: string
          id?: string
          minutes: number
          step_id: string
        }
        Update: {
          appliance_type?: string
          created_at?: string
          id?: string
          minutes?: number
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_step_appliance_times_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "recipe_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_steps: {
        Row: {
          base_minutes: number | null
          created_at: string
          id: string
          is_prep_ahead: boolean
          recipe_id: string
          step_order: number
          technique: string | null
          text: string
          updated_at: string
        }
        Insert: {
          base_minutes?: number | null
          created_at?: string
          id?: string
          is_prep_ahead?: boolean
          recipe_id: string
          step_order: number
          technique?: string | null
          text: string
          updated_at?: string
        }
        Update: {
          base_minutes?: number | null
          created_at?: string
          id?: string
          is_prep_ahead?: boolean
          recipe_id?: string
          step_order?: number
          technique?: string | null
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          cook_time: number | null
          created_at: string
          description: string | null
          dietary_tags: string[] | null
          difficulty: string | null
          has_main_veg: boolean
          household_id: string
          id: string
          image_url: string | null
          instructions: string | null
          is_favorite: boolean
          meal_type: string
          prep_time: number | null
          protein_group: string | null
          rating: number | null
          servings: number | null
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          cook_time?: number | null
          created_at?: string
          description?: string | null
          dietary_tags?: string[] | null
          difficulty?: string | null
          has_main_veg?: boolean
          household_id: string
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_favorite?: boolean
          meal_type?: string
          prep_time?: number | null
          protein_group?: string | null
          rating?: number | null
          servings?: number | null
          source?: string
          title: string
          updated_at?: string
        }
        Update: {
          cook_time?: number | null
          created_at?: string
          description?: string | null
          dietary_tags?: string[] | null
          difficulty?: string | null
          has_main_veg?: boolean
          household_id?: string
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_favorite?: boolean
          meal_type?: string
          prep_time?: number | null
          protein_group?: string | null
          rating?: number | null
          servings?: number | null
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      salaries: {
        Row: {
          amount: number | null
          contribution_type: string
          contribution_value: number
          created_at: string
          currency: string
          effective_from: string
          household_id: string
          id: string
          member_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          contribution_type?: string
          contribution_value?: number
          created_at?: string
          currency?: string
          effective_from?: string
          household_id: string
          id?: string
          member_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          contribution_type?: string
          contribution_value?: number
          created_at?: string
          currency?: string
          effective_from?: string
          household_id?: string
          id?: string
          member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salaries_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salaries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_day_slots: {
        Row: {
          created_at: string
          date: string
          end_time: string
          household_id: string
          id: string
          label: string | null
          member_id: string
          notes: string | null
          slot_kind: Database["public"]["Enums"]["schedule_slot_kind"]
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          end_time: string
          household_id: string
          id?: string
          label?: string | null
          member_id: string
          notes?: string | null
          slot_kind?: Database["public"]["Enums"]["schedule_slot_kind"]
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          end_time?: string
          household_id?: string
          id?: string
          label?: string | null
          member_id?: string
          notes?: string | null
          slot_kind?: Database["public"]["Enums"]["schedule_slot_kind"]
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_day_slots_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_day_slots_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_day_status: {
        Row: {
          created_at: string
          date: string
          household_id: string
          id: string
          member_id: string
          notes: string | null
          overtime_hours: number
          state: Database["public"]["Enums"]["schedule_day_state"]
          updated_at: string
          use_day_override: boolean
        }
        Insert: {
          created_at?: string
          date: string
          household_id: string
          id?: string
          member_id: string
          notes?: string | null
          overtime_hours?: number
          state?: Database["public"]["Enums"]["schedule_day_state"]
          updated_at?: string
          use_day_override?: boolean
        }
        Update: {
          created_at?: string
          date?: string
          household_id?: string
          id?: string
          member_id?: string
          notes?: string | null
          overtime_hours?: number
          state?: Database["public"]["Enums"]["schedule_day_state"]
          updated_at?: string
          use_day_override?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "schedule_day_status_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_day_status_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_notification_log: {
        Row: {
          created_at: string
          household_id: string
          id: string
          member_id: string
          notice_type: string
          sent_at: string
          slot_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          member_id: string
          notice_type: string
          sent_at?: string
          slot_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          member_id?: string
          notice_type?: string
          sent_at?: string
          slot_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_notification_log_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_notification_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_settings: {
        Row: {
          created_at: string
          household_id: string
          id: string
          is_shared: boolean
          kind: Database["public"]["Enums"]["schedule_kind"]
          member_id: string
          notes: string | null
          notify_household: boolean
          target_hours_per_day: number
          updated_at: string
          use_template: boolean
          vacation_balance_adjustment: number
          vacation_days_per_month: number
          vacation_start_date: string | null
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          is_shared?: boolean
          kind?: Database["public"]["Enums"]["schedule_kind"]
          member_id: string
          notes?: string | null
          notify_household?: boolean
          target_hours_per_day?: number
          updated_at?: string
          use_template?: boolean
          vacation_balance_adjustment?: number
          vacation_days_per_month?: number
          vacation_start_date?: string | null
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          is_shared?: boolean
          kind?: Database["public"]["Enums"]["schedule_kind"]
          member_id?: string
          notes?: string | null
          notify_household?: boolean
          target_hours_per_day?: number
          updated_at?: string
          use_template?: boolean
          vacation_balance_adjustment?: number
          vacation_days_per_month?: number
          vacation_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_settings_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_settings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_template_slots: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          household_id: string
          id: string
          label: string | null
          member_id: string
          notes: string | null
          slot_kind: Database["public"]["Enums"]["schedule_slot_kind"]
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          household_id: string
          id?: string
          label?: string | null
          member_id: string
          notes?: string | null
          slot_kind?: Database["public"]["Enums"]["schedule_slot_kind"]
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          household_id?: string
          id?: string
          label?: string | null
          member_id?: string
          notes?: string | null
          slot_kind?: Database["public"]["Enums"]["schedule_slot_kind"]
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_template_slots_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_template_slots_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          category: string | null
          checked: boolean
          created_at: string
          id: string
          image_url: string | null
          linked_inventory_item_id: string | null
          manual_price: number | null
          mercadona_id: string | null
          name: string
          ocr_price: number | null
          priority: string
          quantity: number
          shopping_list_id: string
          store_product_brand: string | null
          store_product_id: string | null
          store_product_source: string | null
          store_product_url: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          checked?: boolean
          created_at?: string
          id?: string
          image_url?: string | null
          linked_inventory_item_id?: string | null
          manual_price?: number | null
          mercadona_id?: string | null
          name: string
          ocr_price?: number | null
          priority?: string
          quantity?: number
          shopping_list_id: string
          store_product_brand?: string | null
          store_product_id?: string | null
          store_product_source?: string | null
          store_product_url?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          checked?: boolean
          created_at?: string
          id?: string
          image_url?: string | null
          linked_inventory_item_id?: string | null
          manual_price?: number | null
          mercadona_id?: string | null
          name?: string
          ocr_price?: number | null
          priority?: string
          quantity?: number
          shopping_list_id?: string
          store_product_brand?: string | null
          store_product_id?: string | null
          store_product_source?: string | null
          store_product_url?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_linked_inventory_item_id_fkey"
            columns: ["linked_inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_shopping_list_id_fkey"
            columns: ["shopping_list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          created_at: string
          date: string | null
          household_id: string
          id: string
          is_archived: boolean
          name: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date?: string | null
          household_id: string
          id?: string
          is_archived?: boolean
          name: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string | null
          household_id?: string
          id?: string
          is_archived?: boolean
          name?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_lists_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sos_acknowledgements: {
        Row: {
          acknowledged_at: string | null
          channel: string | null
          created_at: string
          household_id: string
          id: string
          recipient_name: string | null
          sos_event_id: string
          telegram_chat_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          channel?: string | null
          created_at?: string
          household_id: string
          id?: string
          recipient_name?: string | null
          sos_event_id: string
          telegram_chat_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          channel?: string | null
          created_at?: string
          household_id?: string
          id?: string
          recipient_name?: string | null
          sos_event_id?: string
          telegram_chat_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sos_acknowledgements_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sos_acknowledgements_sos_event_id_fkey"
            columns: ["sos_event_id"]
            isOneToOne: false
            referencedRelation: "sos_events"
            referencedColumns: ["id"]
          },
        ]
      }
      sos_events: {
        Row: {
          acknowledged_at: string | null
          battery_charging: boolean | null
          battery_level: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          connection_type: string | null
          created_at: string
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          household_id: string
          id: string
          is_test: boolean
          last_known_location_used: boolean
          last_reminder_sent_at: string | null
          latitude: number | null
          location_accuracy: number | null
          location_source: string | null
          longitude: number | null
          note: string | null
          reminder_count: number
          sos_type: string
          triggered_by: string | null
          triggered_by_name: string
        }
        Insert: {
          acknowledged_at?: string | null
          battery_charging?: boolean | null
          battery_level?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          connection_type?: string | null
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          household_id: string
          id?: string
          is_test?: boolean
          last_known_location_used?: boolean
          last_reminder_sent_at?: string | null
          latitude?: number | null
          location_accuracy?: number | null
          location_source?: string | null
          longitude?: number | null
          note?: string | null
          reminder_count?: number
          sos_type?: string
          triggered_by?: string | null
          triggered_by_name: string
        }
        Update: {
          acknowledged_at?: string | null
          battery_charging?: boolean | null
          battery_level?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          connection_type?: string | null
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          household_id?: string
          id?: string
          is_test?: boolean
          last_known_location_used?: boolean
          last_reminder_sent_at?: string | null
          latitude?: number | null
          location_accuracy?: number | null
          location_source?: string | null
          longitude?: number | null
          note?: string | null
          reminder_count?: number
          sos_type?: string
          triggered_by?: string | null
          triggered_by_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sos_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      store_catalog_price_history: {
        Row: {
          captured_at: string
          created_at: string
          id: string
          price: number | null
          provider_key: string | null
          reference_format: string | null
          reference_price: number | null
          store_catalog_product_id: string
          store_key: string
        }
        Insert: {
          captured_at?: string
          created_at?: string
          id?: string
          price?: number | null
          provider_key?: string | null
          reference_format?: string | null
          reference_price?: number | null
          store_catalog_product_id: string
          store_key: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          id?: string
          price?: number | null
          provider_key?: string | null
          reference_format?: string | null
          reference_price?: number | null
          store_catalog_product_id?: string
          store_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_catalog_price_history_store_catalog_product_id_fkey"
            columns: ["store_catalog_product_id"]
            isOneToOne: false
            referencedRelation: "store_catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      store_catalog_products: {
        Row: {
          brand: string | null
          captured_at: string
          category: string | null
          created_at: string
          ean: string | null
          external_id: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          packaging: string | null
          price: number | null
          product_url: string | null
          provider_key: string | null
          query_term: string | null
          raw: Json
          reference_format: string | null
          reference_price: number | null
          store_key: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          captured_at?: string
          category?: string | null
          created_at?: string
          ean?: string | null
          external_id?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          packaging?: string | null
          price?: number | null
          product_url?: string | null
          provider_key?: string | null
          query_term?: string | null
          raw?: Json
          reference_format?: string | null
          reference_price?: number | null
          store_key: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          captured_at?: string
          category?: string | null
          created_at?: string
          ean?: string | null
          external_id?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          packaging?: string | null
          price?: number | null
          product_url?: string | null
          provider_key?: string | null
          query_term?: string | null
          raw?: Json
          reference_format?: string | null
          reference_price?: number | null
          store_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_catalog_products_provider_key_fkey"
            columns: ["provider_key"]
            isOneToOne: false
            referencedRelation: "store_scrape_providers"
            referencedColumns: ["provider_key"]
          },
          {
            foreignKeyName: "store_catalog_products_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "store_catalog_source_settings"
            referencedColumns: ["store_key"]
          },
        ]
      }
      store_catalog_refresh_queue: {
        Row: {
          created_at: string
          estimated_credits: number
          id: string
          last_attempt_at: string | null
          last_error: string | null
          last_success_at: string | null
          priority_score: number
          provider_key: string | null
          status: string
          store_key: string
          term_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          estimated_credits?: number
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          priority_score?: number
          provider_key?: string | null
          status?: string
          store_key: string
          term_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          estimated_credits?: number
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          priority_score?: number
          provider_key?: string | null
          status?: string
          store_key?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_catalog_refresh_queue_provider_key_fkey"
            columns: ["provider_key"]
            isOneToOne: false
            referencedRelation: "store_scrape_providers"
            referencedColumns: ["provider_key"]
          },
          {
            foreignKeyName: "store_catalog_refresh_queue_store_key_fkey"
            columns: ["store_key"]
            isOneToOne: false
            referencedRelation: "store_catalog_source_settings"
            referencedColumns: ["store_key"]
          },
          {
            foreignKeyName: "store_catalog_refresh_queue_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "store_catalog_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      store_catalog_source_settings: {
        Row: {
          created_at: string
          enabled: boolean
          external_search_url_template: string | null
          mode: string
          notes: string | null
          preferred_provider_key: string | null
          priority_weight: number
          store_key: string
          store_name: string
          updated_at: string
          weekly_term_limit: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          external_search_url_template?: string | null
          mode?: string
          notes?: string | null
          preferred_provider_key?: string | null
          priority_weight?: number
          store_key: string
          store_name: string
          updated_at?: string
          weekly_term_limit?: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          external_search_url_template?: string | null
          mode?: string
          notes?: string | null
          preferred_provider_key?: string | null
          priority_weight?: number
          store_key?: string
          store_name?: string
          updated_at?: string
          weekly_term_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_catalog_source_settings_preferred_provider_key_fkey"
            columns: ["preferred_provider_key"]
            isOneToOne: false
            referencedRelation: "store_scrape_providers"
            referencedColumns: ["provider_key"]
          },
        ]
      }
      store_catalog_terms: {
        Row: {
          created_at: string
          id: string
          inventory_count: number
          last_added_at: string
          last_searched_at: string | null
          normalized_term: string
          search_count: number
          shopping_count: number
          term: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_count?: number
          last_added_at?: string
          last_searched_at?: string | null
          normalized_term: string
          search_count?: number
          shopping_count?: number
          term: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_count?: number
          last_added_at?: string
          last_searched_at?: string | null
          normalized_term?: string
          search_count?: number
          shopping_count?: number
          term?: string
          updated_at?: string
        }
        Relationships: []
      }
      store_scrape_providers: {
        Row: {
          created_at: string
          enabled: boolean
          estimated_credits_per_query: number
          monthly_budget_credits: number
          name: string
          notes: string | null
          provider_key: string
          secret_name: string | null
          updated_at: string
          weekly_budget_credits: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          estimated_credits_per_query?: number
          monthly_budget_credits?: number
          name: string
          notes?: string | null
          provider_key: string
          secret_name?: string | null
          updated_at?: string
          weekly_budget_credits?: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          estimated_credits_per_query?: number
          monthly_budget_credits?: number
          name?: string
          notes?: string | null
          provider_key?: string
          secret_name?: string | null
          updated_at?: string
          weekly_budget_credits?: number
        }
        Relationships: []
      }
      stores: {
        Row: {
          color: string | null
          created_at: string
          household_id: string
          icon: string | null
          id: string
          is_default: boolean
          is_enabled: boolean
          name: string
          official_source: string | null
          sort_order: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          household_id: string
          icon?: string | null
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          name: string
          official_source?: string | null
          sort_order?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          household_id?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          name?: string
          official_source?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "stores_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          category: string | null
          checklist: Json | null
          child_allowed: boolean
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          household_id: string
          id: string
          notified_at: string | null
          photo_path: string | null
          priority: string
          recurrence: string | null
          recurrence_days: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          checklist?: Json | null
          child_allowed?: boolean
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          household_id: string
          id?: string
          notified_at?: string | null
          photo_path?: string | null
          priority?: string
          recurrence?: string | null
          recurrence_days?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          checklist?: Json | null
          child_allowed?: boolean
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          household_id?: string
          id?: string
          notified_at?: string | null
          photo_path?: string | null
          priority?: string
          recurrence?: string | null
          recurrence_days?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_pending_links: {
        Row: {
          chat_id: string
          created_at: string
          id: string
          token: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          id?: string
          token: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          id?: string
          token?: string
        }
        Relationships: []
      }
      telegram_profiles: {
        Row: {
          chat_id: string | null
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_id?: string | null
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_id?: string | null
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          household_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          household_id: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          household_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_claims: {
        Row: {
          claimer_member_id: string
          created_at: string
          household_id: string
          id: string
          notes: string | null
          status: string
          tracked_price: number | null
          tracked_store: string | null
          tracked_url: string | null
          updated_at: string
          wishlist_item_id: string
        }
        Insert: {
          claimer_member_id: string
          created_at?: string
          household_id: string
          id?: string
          notes?: string | null
          status?: string
          tracked_price?: number | null
          tracked_store?: string | null
          tracked_url?: string | null
          updated_at?: string
          wishlist_item_id: string
        }
        Update: {
          claimer_member_id?: string
          created_at?: string
          household_id?: string
          id?: string
          notes?: string | null
          status?: string
          tracked_price?: number | null
          tracked_store?: string | null
          tracked_url?: string | null
          updated_at?: string
          wishlist_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_claims_claimer_member_id_fkey"
            columns: ["claimer_member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_claims_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_claims_wishlist_item_id_fkey"
            columns: ["wishlist_item_id"]
            isOneToOne: false
            referencedRelation: "wishlist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_items: {
        Row: {
          created_at: string
          created_by_member_id: string
          description: string | null
          estimated_price: number | null
          for_member_id: string
          household_id: string
          id: string
          priority: string
          recipient_reaction: string
          status: string
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by_member_id: string
          description?: string | null
          estimated_price?: number | null
          for_member_id: string
          household_id: string
          id?: string
          priority?: string
          recipient_reaction?: string
          status?: string
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by_member_id?: string
          description?: string | null
          estimated_price?: number | null
          for_member_id?: string
          household_id?: string
          id?: string
          priority?: string
          recipient_reaction?: string
          status?: string
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_created_by_member_id_fkey"
            columns: ["created_by_member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_items_for_member_id_fkey"
            columns: ["for_member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_member_schedule: {
        Args: { _member_id: string }
        Returns: boolean
      }
      can_view_member_schedule: {
        Args: { _is_shared: boolean; _member_id: string }
        Returns: boolean
      }
      can_view_wishlist_claim: { Args: { _item_id: string }; Returns: boolean }
      cleanup_household_activity_retention: { Args: never; Returns: number }
      current_household: { Args: never; Returns: string }
      get_household_contributions: {
        Args: { _household_id: string }
        Returns: {
          contribution_amount: number
          contribution_type: string
          contribution_value: number
          display_name: string
          has_income: boolean
          is_child: boolean
          member_id: string
        }[]
      }
      get_medication_due_intakes: {
        Args: { _from: string; _household_id: string; _to: string }
        Returns: {
          dose_amount: number
          form: Database["public"]["Enums"]["medication_form"]
          intake_id: string
          last_reminder_sent_at: string
          medication_id: string
          member_id: string
          name: string
          reminder_count: number
          schedule_id: string
          scheduled_for: string
          status: Database["public"]["Enums"]["medication_intake_status"]
          unit: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_household_member: {
        Args: { _household_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "member" | "child"
      medication_form:
        | "pill"
        | "ml"
        | "drops"
        | "inhaler"
        | "patch"
        | "injection"
        | "other"
      medication_intake_status: "pending" | "taken" | "skipped" | "missed"
      schedule_day_state: "normal" | "vacation" | "holiday" | "sick" | "off"
      schedule_kind: "work" | "school"
      schedule_slot_kind:
        | "work"
        | "subject"
        | "extracurricular"
        | "break"
        | "off"
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
      app_role: ["admin", "member", "child"],
      medication_form: [
        "pill",
        "ml",
        "drops",
        "inhaler",
        "patch",
        "injection",
        "other",
      ],
      medication_intake_status: ["pending", "taken", "skipped", "missed"],
      schedule_day_state: ["normal", "vacation", "holiday", "sick", "off"],
      schedule_kind: ["work", "school"],
      schedule_slot_kind: [
        "work",
        "subject",
        "extracurricular",
        "break",
        "off",
      ],
    },
  },
} as const
