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
          household_id: string
          id: string
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
          household_id: string
          id?: string
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
          household_id?: string
          id?: string
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
          household_id: string
          id: string
          last_state_at: string | null
          name: string
          next_maintenance: string | null
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
          household_id: string
          id?: string
          last_state_at?: string | null
          name: string
          next_maintenance?: string | null
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
          household_id?: string
          id?: string
          last_state_at?: string | null
          name?: string
          next_maintenance?: string | null
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
      household_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string
          household_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at?: string
          household_id: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          household_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
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
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          household_id: string
          id?: string
          is_child?: boolean
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          household_id?: string
          id?: string
          is_child?: boolean
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
          household_id: string
          id: string
          image_url: string | null
          last_price: number | null
          location: string | null
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
          household_id: string
          id?: string
          image_url?: string | null
          last_price?: number | null
          location?: string | null
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
          household_id?: string
          id?: string
          image_url?: string | null
          last_price?: number | null
          location?: string | null
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
      medicines: {
        Row: {
          created_at: string
          expiry_month: number | null
          expiry_year: number | null
          household_id: string
          id: string
          name: string
          needs_purchase: boolean
          note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expiry_month?: number | null
          expiry_year?: number | null
          household_id: string
          id?: string
          name: string
          needs_purchase?: boolean
          note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expiry_month?: number | null
          expiry_year?: number | null
          household_id?: string
          id?: string
          name?: string
          needs_purchase?: boolean
          note?: string | null
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
          id: string
          preferred_currency: string
          preferred_language: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          preferred_currency?: string
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          preferred_currency?: string
          preferred_language?: string
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
          image_url: string
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
          image_url: string
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
          image_url?: string
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
      shopping_list_items: {
        Row: {
          category: string | null
          checked: boolean
          created_at: string
          id: string
          image_url: string | null
          linked_inventory_item_id: string | null
          manual_price: number | null
          name: string
          ocr_price: number | null
          quantity: number
          shopping_list_id: string
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
          name: string
          ocr_price?: number | null
          quantity?: number
          shopping_list_id: string
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
          name?: string
          ocr_price?: number | null
          quantity?: number
          shopping_list_id?: string
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
      stores: {
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
    },
  },
} as const
