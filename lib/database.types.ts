
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "admins": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "admins_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"areas": {
                  Row: {
                    "created_at": string,"description": string | null,"icon": string | null,"name": string,"slug": string,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"icon"?: string | null,"name": string,"slug": string,"sort"?: number
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"icon"?: string | null,"name"?: string,"slug"?: string,"sort"?: number
                  }
                  Relationships: [
                    
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"at": string,"created_at": string,"data": NonNullable<Json>,"entity": string,"entity_id": string | null,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"at"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"entity": string,"entity_id"?: string | null,"id"?: number
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"at"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"entity"?: string,"entity_id"?: string | null,"id"?: number
                  }
                  Relationships: [
                    
                  ]
                },"availability": {
                  Row: {
                    "created_at": string,"end_time": string,"id": string,"provider_id": string,"start_time": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"end_time": string,"id"?: string,"provider_id": string,"start_time": string,"weekday": number
                  }
                  Update: {
                    "created_at"?: string,"end_time"?: string,"id"?: string,"provider_id"?: string,"start_time"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "availability_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "availability_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"booking_events": {
                  Row: {
                    "actor_id": string | null,"at": string,"booking_id": string,"created_at": string,"from_status": Database["public"]['Enums']["booking_status"] | null,"id": string,"reason": string | null,"to_status": Database["public"]['Enums']["booking_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"at"?: string,"booking_id": string,"created_at"?: string,"from_status"?: Database["public"]['Enums']["booking_status"] | null,"id"?: string,"reason"?: string | null,"to_status": Database["public"]['Enums']["booking_status"]
                  }
                  Update: {
                    "actor_id"?: string | null,"at"?: string,"booking_id"?: string,"created_at"?: string,"from_status"?: Database["public"]['Enums']["booking_status"] | null,"id"?: string,"reason"?: string | null,"to_status"?: Database["public"]['Enums']["booking_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_events_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "admin_open_disputes"
      referencedColumns: ["booking_id"]
    },{
      foreignKeyName: "booking_events_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "canceled_reason": string | null,"client_id": string | null,"created_at": string,"household_id": string | null,"id": string,"notes": string | null,"occupation_slug": string,"origin": Database["public"]['Enums']["booking_origin"],"period": unknown,"platform_fee_cents": number,"price_cents": number,"proposal_id": string | null,"provider_client_id": string | null,"provider_id": string | null,"request_id": string | null,"service_id": string | null,"status": Database["public"]['Enums']["booking_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "canceled_reason"?: string | null,"client_id"?: string | null,"created_at"?: string,"household_id"?: string | null,"id"?: string,"notes"?: string | null,"occupation_slug": string,"origin"?: Database["public"]['Enums']["booking_origin"],"period": unknown,"platform_fee_cents"?: number,"price_cents": number,"proposal_id"?: string | null,"provider_client_id"?: string | null,"provider_id"?: string | null,"request_id"?: string | null,"service_id"?: string | null,"status"?: Database["public"]['Enums']["booking_status"],"updated_at"?: string
                  }
                  Update: {
                    "canceled_reason"?: string | null,"client_id"?: string | null,"created_at"?: string,"household_id"?: string | null,"id"?: string,"notes"?: string | null,"occupation_slug"?: string,"origin"?: Database["public"]['Enums']["booking_origin"],"period"?: unknown,"platform_fee_cents"?: number,"price_cents"?: number,"proposal_id"?: string | null,"provider_client_id"?: string | null,"provider_id"?: string | null,"request_id"?: string | null,"service_id"?: string | null,"status"?: Database["public"]['Enums']["booking_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_occupation_slug_fkey"
      columns: ["occupation_slug"]
isOneToOne: false
      referencedRelation: "occupations"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "bookings_proposal_id_fkey"
      columns: ["proposal_id"]
isOneToOne: false
      referencedRelation: "proposals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_provider_client_id_fkey"
      columns: ["provider_client_id"]
isOneToOne: false
      referencedRelation: "provider_clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "bookings_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"care_recipients": {
                  Row: {
                    "birth_year": number | null,"created_at": string,"emergency_contact": string | null,"first_name": string,"household_id": string,"id": string,"preferences": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "birth_year"?: number | null,"created_at"?: string,"emergency_contact"?: string | null,"first_name": string,"household_id": string,"id"?: string,"preferences"?: string | null
                  }
                  Update: {
                    "birth_year"?: number | null,"created_at"?: string,"emergency_contact"?: string | null,"first_name"?: string,"household_id"?: string,"id"?: string,"preferences"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "care_recipients_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"checkins": {
                  Row: {
                    "at": string,"created_at": string,"id": string,"kind": string,"lat": number | null,"lng": number | null,"provider_id": string | null,"shift_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"created_at"?: string,"id"?: string,"kind": string,"lat"?: number | null,"lng"?: number | null,"provider_id"?: string | null,"shift_id": string
                  }
                  Update: {
                    "at"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"lat"?: number | null,"lng"?: number | null,"provider_id"?: string | null,"shift_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "checkins_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "checkins_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "checkins_shift_id_fkey"
      columns: ["shift_id"]
isOneToOne: false
      referencedRelation: "shifts"
      referencedColumns: ["id"]
    }
                  ]
                },"consents": {
                  Row: {
                    "at": string,"created_at": string,"granted": boolean,"id": string,"purpose": Database["public"]['Enums']["consent_purpose"],"user_id": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"created_at"?: string,"granted": boolean,"id"?: string,"purpose": Database["public"]['Enums']["consent_purpose"],"user_id"?: string,"version": string
                  }
                  Update: {
                    "at"?: string,"created_at"?: string,"granted"?: boolean,"id"?: string,"purpose"?: Database["public"]['Enums']["consent_purpose"],"user_id"?: string,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "consents_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_payment_profiles": {
                  Row: {
                    "asaas_customer_id": string,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "asaas_customer_id": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "asaas_customer_id"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_payment_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"daily_reports": {
                  Row: {
                    "activities": string | null,"created_at": string,"id": string,"meals": string | null,"mood": string | null,"notes": string | null,"provider_id": string | null,"shift_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activities"?: string | null,"created_at"?: string,"id"?: string,"meals"?: string | null,"mood"?: string | null,"notes"?: string | null,"provider_id"?: string | null,"shift_id": string
                  }
                  Update: {
                    "activities"?: string | null,"created_at"?: string,"id"?: string,"meals"?: string | null,"mood"?: string | null,"notes"?: string | null,"provider_id"?: string | null,"shift_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "daily_reports_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "daily_reports_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "daily_reports_shift_id_fkey"
      columns: ["shift_id"]
isOneToOne: true
      referencedRelation: "shifts"
      referencedColumns: ["id"]
    }
                  ]
                },"data_requests": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"id": string,"kind": Database["public"]['Enums']["data_request_kind"],"result_path": string | null,"status": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["data_request_kind"],"result_path"?: string | null,"status"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["data_request_kind"],"result_path"?: string | null,"status"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "data_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"households": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"neighborhood_id": string | null,"notes": string | null,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"neighborhood_id"?: string | null,"notes"?: string | null,"owner_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"neighborhood_id"?: string | null,"notes"?: string | null,"owner_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "households_neighborhood_id_fkey"
      columns: ["neighborhood_id"]
isOneToOne: false
      referencedRelation: "neighborhoods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "households_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"neighborhoods": {
                  Row: {
                    "city": string,"created_at": string,"id": string,"name": string,"slug": string,"zone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string,"created_at"?: string,"id"?: string,"name": string,"slug": string,"zone"?: string | null
                  }
                  Update: {
                    "city"?: string,"created_at"?: string,"id"?: string,"name"?: string,"slug"?: string,"zone"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "attempts": number,"channel": Database["public"]['Enums']["notification_channel"],"created_at": string,"email": string | null,"error": string | null,"id": string,"params": NonNullable<Json>,"phone": string | null,"scheduled_for": string,"sent_at": string | null,"status": Database["public"]['Enums']["notification_status"],"template": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"channel": Database["public"]['Enums']["notification_channel"],"created_at"?: string,"email"?: string | null,"error"?: string | null,"id"?: string,"params"?: NonNullable<Json>,"phone"?: string | null,"scheduled_for"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"template": string,"user_id"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"channel"?: Database["public"]['Enums']["notification_channel"],"created_at"?: string,"email"?: string | null,"error"?: string | null,"id"?: string,"params"?: NonNullable<Json>,"phone"?: string | null,"scheduled_for"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"template"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"occupation_policies": {
                  Row: {
                    "audience_minors": boolean,"background_check": boolean,"billing": Database["public"]['Enums']["billing_model"],"confidence": string,"created_at": string,"labor_lock": boolean,"legal_basis": string,"locations": (Database["public"]['Enums']["service_location"])[],"notes": string,"occupation_slug": string,"price_units": (Database["public"]['Enums']["price_unit"])[],"provider_type": Database["public"]['Enums']["provider_kind"],"rating_ranking": boolean,"registry_name": string,"regulated": boolean,"regulator_body": string,"sources": (string)[],"verification": (Database["public"]['Enums']["verification_step"])[]
                  }
                  ComputedFields: never
                  Insert: {
                    "audience_minors"?: boolean,"background_check"?: boolean,"billing"?: Database["public"]['Enums']["billing_model"],"confidence"?: string,"created_at"?: string,"labor_lock"?: boolean,"legal_basis"?: string,"locations"?: (Database["public"]['Enums']["service_location"])[],"notes"?: string,"occupation_slug": string,"price_units"?: (Database["public"]['Enums']["price_unit"])[],"provider_type"?: Database["public"]['Enums']["provider_kind"],"rating_ranking"?: boolean,"registry_name"?: string,"regulated"?: boolean,"regulator_body"?: string,"sources"?: (string)[],"verification"?: (Database["public"]['Enums']["verification_step"])[]
                  }
                  Update: {
                    "audience_minors"?: boolean,"background_check"?: boolean,"billing"?: Database["public"]['Enums']["billing_model"],"confidence"?: string,"created_at"?: string,"labor_lock"?: boolean,"legal_basis"?: string,"locations"?: (Database["public"]['Enums']["service_location"])[],"notes"?: string,"occupation_slug"?: string,"price_units"?: (Database["public"]['Enums']["price_unit"])[],"provider_type"?: Database["public"]['Enums']["provider_kind"],"rating_ranking"?: boolean,"registry_name"?: string,"regulated"?: boolean,"regulator_body"?: string,"sources"?: (string)[],"verification"?: (Database["public"]['Enums']["verification_step"])[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "occupation_policies_occupation_slug_fkey"
      columns: ["occupation_slug"]
isOneToOne: true
      referencedRelation: "occupations"
      referencedColumns: ["slug"]
    }
                  ]
                },"occupations": {
                  Row: {
                    "area_slug": string,"created_at": string,"name": string,"slug": string,"synonyms": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "area_slug": string,"created_at"?: string,"name": string,"slug": string,"synonyms"?: (string)[]
                  }
                  Update: {
                    "area_slug"?: string,"created_at"?: string,"name"?: string,"slug"?: string,"synonyms"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "occupations_area_slug_fkey"
      columns: ["area_slug"]
isOneToOne: false
      referencedRelation: "areas"
      referencedColumns: ["slug"]
    }
                  ]
                },"payment_events": {
                  Row: {
                    "asaas_event_id": string,"created_at": string,"event_type": string,"id": string,"payload": Json | null,"payment_id": string | null,"processed_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "asaas_event_id": string,"created_at"?: string,"event_type": string,"id"?: string,"payload"?: Json | null,"payment_id"?: string | null,"processed_at"?: string | null
                  }
                  Update: {
                    "asaas_event_id"?: string,"created_at"?: string,"event_type"?: string,"id"?: string,"payload"?: Json | null,"payment_id"?: string | null,"processed_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_events_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_cents": number,"asaas_payment_id": string | null,"booking_id": string | null,"created_at": string,"due_date": string | null,"escrow": boolean,"id": string,"invoice_url": string | null,"method": Database["public"]['Enums']["payment_method"],"payer_id": string | null,"pix_payload": string | null,"pix_qr_code": string | null,"platform_fee_cents": number,"provider_id": string | null,"quote_id": string | null,"raw": Json | null,"status": Database["public"]['Enums']["payment_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"asaas_payment_id"?: string | null,"booking_id"?: string | null,"created_at"?: string,"due_date"?: string | null,"escrow"?: boolean,"id"?: string,"invoice_url"?: string | null,"method"?: Database["public"]['Enums']["payment_method"],"payer_id"?: string | null,"pix_payload"?: string | null,"pix_qr_code"?: string | null,"platform_fee_cents"?: number,"provider_id"?: string | null,"quote_id"?: string | null,"raw"?: Json | null,"status"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"asaas_payment_id"?: string | null,"booking_id"?: string | null,"created_at"?: string,"due_date"?: string | null,"escrow"?: boolean,"id"?: string,"invoice_url"?: string | null,"method"?: Database["public"]['Enums']["payment_method"],"payer_id"?: string | null,"pix_payload"?: string | null,"pix_qr_code"?: string | null,"platform_fee_cents"?: number,"provider_id"?: string | null,"quote_id"?: string | null,"raw"?: Json | null,"status"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "admin_open_disputes"
      referencedColumns: ["booking_id"]
    },{
      foreignKeyName: "payments_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_payer_id_fkey"
      columns: ["payer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "payments_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_settings": {
                  Row: {
                    "created_at": string,"internal": boolean,"key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"internal"?: boolean,"key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"internal"?: boolean,"key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "city": string | null,"created_at": string,"deleted_at": string | null,"full_name": string | null,"id": string,"phone": string | null,"role": Database["public"]['Enums']["user_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"full_name"?: string | null,"id": string,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"]
                  }
                  Update: {
                    "city"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"full_name"?: string | null,"id"?: string,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"]
                  }
                  Relationships: [
                    
                  ]
                },"proposals": {
                  Row: {
                    "created_at": string,"id": string,"message": string | null,"price_cents": number,"provider_id": string,"request_id": string,"status": Database["public"]['Enums']["proposal_status"],"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"message"?: string | null,"price_cents": number,"provider_id"?: string,"request_id": string,"status"?: Database["public"]['Enums']["proposal_status"],"valid_until"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"message"?: string | null,"price_cents"?: number,"provider_id"?: string,"request_id"?: string,"status"?: Database["public"]['Enums']["proposal_status"],"valid_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "proposals_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "proposals_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "proposals_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["id"]
    }
                  ]
                },"provider_clients": {
                  Row: {
                    "client_id": string | null,"created_at": string,"email": string | null,"id": string,"name": string,"notes": string | null,"origin": Database["public"]['Enums']["booking_origin"],"phone": string | null,"provider_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"origin"?: Database["public"]['Enums']["booking_origin"],"phone"?: string | null,"provider_id": string
                  }
                  Update: {
                    "client_id"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"origin"?: Database["public"]['Enums']["booking_origin"],"phone"?: string | null,"provider_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "provider_clients_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "provider_clients_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "provider_clients_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"provider_documents": {
                  Row: {
                    "created_at": string,"expires_at": string | null,"id": string,"provider_id": string,"rejection_reason": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["document_status"],"step": Database["public"]['Enums']["verification_step"],"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"provider_id": string,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["document_status"],"step": Database["public"]['Enums']["verification_step"],"storage_path": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"provider_id"?: string,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["document_status"],"step"?: Database["public"]['Enums']["verification_step"],"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "provider_documents_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "provider_documents_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "provider_documents_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"provider_neighborhoods": {
                  Row: {
                    "created_at": string,"neighborhood_id": string,"provider_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"neighborhood_id": string,"provider_id": string
                  }
                  Update: {
                    "created_at"?: string,"neighborhood_id"?: string,"provider_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "provider_neighborhoods_neighborhood_id_fkey"
      columns: ["neighborhood_id"]
isOneToOne: false
      referencedRelation: "neighborhoods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "provider_neighborhoods_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "provider_neighborhoods_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"provider_occupations": {
                  Row: {
                    "created_at": string,"is_primary": boolean,"occupation_slug": string,"provider_id": string,"registry_number": string | null,"registry_status": Database["public"]['Enums']["registry_status"],"registry_uf": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"is_primary"?: boolean,"occupation_slug": string,"provider_id": string,"registry_number"?: string | null,"registry_status"?: Database["public"]['Enums']["registry_status"],"registry_uf"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"is_primary"?: boolean,"occupation_slug"?: string,"provider_id"?: string,"registry_number"?: string | null,"registry_status"?: Database["public"]['Enums']["registry_status"],"registry_uf"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "provider_occupations_occupation_slug_fkey"
      columns: ["occupation_slug"]
isOneToOne: false
      referencedRelation: "occupations"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "provider_occupations_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "provider_occupations_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"provider_payment_accounts": {
                  Row: {
                    "api_key_secret_id": string | null,"asaas_account_id": string | null,"asaas_wallet_id": string | null,"created_at": string,"provider_id": string,"status": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "api_key_secret_id"?: string | null,"asaas_account_id"?: string | null,"asaas_wallet_id"?: string | null,"created_at"?: string,"provider_id": string,"status"?: string | null
                  }
                  Update: {
                    "api_key_secret_id"?: string | null,"asaas_account_id"?: string | null,"asaas_wallet_id"?: string | null,"created_at"?: string,"provider_id"?: string,"status"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "provider_payment_accounts_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: true
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "provider_payment_accounts_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: true
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"providers": {
                  Row: {
                    "accepts_platform_requests": boolean,"avatar_path": string | null,"base_neighborhood_id": string | null,"bio": string | null,"created_at": string,"display_name": string,"id": string,"plan": Database["public"]['Enums']["plan_code"],"slug": string,"status": Database["public"]['Enums']["provider_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "accepts_platform_requests"?: boolean,"avatar_path"?: string | null,"base_neighborhood_id"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name": string,"id": string,"plan"?: Database["public"]['Enums']["plan_code"],"slug": string,"status"?: Database["public"]['Enums']["provider_status"]
                  }
                  Update: {
                    "accepts_platform_requests"?: boolean,"avatar_path"?: string | null,"base_neighborhood_id"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string,"plan"?: Database["public"]['Enums']["plan_code"],"slug"?: string,"status"?: Database["public"]['Enums']["provider_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "providers_base_neighborhood_id_fkey"
      columns: ["base_neighborhood_id"]
isOneToOne: false
      referencedRelation: "neighborhoods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "providers_id_fkey"
      columns: ["id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"quotes": {
                  Row: {
                    "client_name": string | null,"client_phone": string | null,"created_at": string,"id": string,"items": NonNullable<Json>,"notes": string | null,"provider_client_id": string | null,"provider_id": string,"public_token": string,"status": Database["public"]['Enums']["quote_status"],"title": string,"total_cents": number,"updated_at": string,"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "client_name"?: string | null,"client_phone"?: string | null,"created_at"?: string,"id"?: string,"items"?: NonNullable<Json>,"notes"?: string | null,"provider_client_id"?: string | null,"provider_id"?: string,"public_token"?: string,"status"?: Database["public"]['Enums']["quote_status"],"title": string,"total_cents"?: number,"updated_at"?: string,"valid_until"?: string | null
                  }
                  Update: {
                    "client_name"?: string | null,"client_phone"?: string | null,"created_at"?: string,"id"?: string,"items"?: NonNullable<Json>,"notes"?: string | null,"provider_client_id"?: string | null,"provider_id"?: string,"public_token"?: string,"status"?: Database["public"]['Enums']["quote_status"],"title"?: string,"total_cents"?: number,"updated_at"?: string,"valid_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotes_provider_client_id_fkey"
      columns: ["provider_client_id"]
isOneToOne: false
      referencedRelation: "provider_clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "quotes_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"requests": {
                  Row: {
                    "client_id": string,"created_at": string,"description": string,"expires_at": string,"id": string,"neighborhood_id": string,"occupation_slug": string,"preferred_dates": string | null,"status": Database["public"]['Enums']["request_status"],"urgent": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id"?: string,"created_at"?: string,"description": string,"expires_at"?: string,"id"?: string,"neighborhood_id": string,"occupation_slug": string,"preferred_dates"?: string | null,"status"?: Database["public"]['Enums']["request_status"],"urgent"?: boolean
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"description"?: string,"expires_at"?: string,"id"?: string,"neighborhood_id"?: string,"occupation_slug"?: string,"preferred_dates"?: string | null,"status"?: Database["public"]['Enums']["request_status"],"urgent"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "requests_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_neighborhood_id_fkey"
      columns: ["neighborhood_id"]
isOneToOne: false
      referencedRelation: "neighborhoods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_occupation_slug_fkey"
      columns: ["occupation_slug"]
isOneToOne: false
      referencedRelation: "occupations"
      referencedColumns: ["slug"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "booking_id": string,"client_id": string | null,"comment": string | null,"created_at": string,"id": string,"provider_id": string | null,"published": boolean,"rating": number
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id": string,"client_id"?: string | null,"comment"?: string | null,"created_at"?: string,"id"?: string,"provider_id"?: string | null,"published"?: boolean,"rating": number
                  }
                  Update: {
                    "booking_id"?: string,"client_id"?: string | null,"comment"?: string | null,"created_at"?: string,"id"?: string,"provider_id"?: string | null,"published"?: boolean,"rating"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: true
      referencedRelation: "admin_open_disputes"
      referencedColumns: ["booking_id"]
    },{
      foreignKeyName: "reviews_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: true
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "reviews_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"services": {
                  Row: {
                    "active": boolean,"created_at": string,"description": string | null,"duration_minutes": number | null,"id": string,"occupation_slug": string,"price_max_cents": number | null,"price_min_cents": number,"provider_id": string,"title": string,"unit": Database["public"]['Enums']["price_unit"]
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"description"?: string | null,"duration_minutes"?: number | null,"id"?: string,"occupation_slug": string,"price_max_cents"?: number | null,"price_min_cents": number,"provider_id": string,"title": string,"unit": Database["public"]['Enums']["price_unit"]
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"description"?: string | null,"duration_minutes"?: number | null,"id"?: string,"occupation_slug"?: string,"price_max_cents"?: number | null,"price_min_cents"?: number,"provider_id"?: string,"title"?: string,"unit"?: Database["public"]['Enums']["price_unit"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "services_provider_id_occupation_slug_fkey"
      columns: ["provider_id","occupation_slug"]
isOneToOne: false
      referencedRelation: "provider_occupations"
      referencedColumns: ["provider_id","occupation_slug"]
    }
                  ]
                },"shift_offers": {
                  Row: {
                    "created_at": string,"provider_id": string,"shift_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"provider_id": string,"shift_id": string,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"provider_id"?: string,"shift_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shift_offers_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "shift_offers_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shift_offers_shift_id_fkey"
      columns: ["shift_id"]
isOneToOne: false
      referencedRelation: "shifts"
      referencedColumns: ["id"]
    }
                  ]
                },"shifts": {
                  Row: {
                    "care_recipient_id": string | null,"caregiver_payout_cents": number | null,"created_at": string,"household_id": string,"id": string,"notes": string | null,"period": unknown,"provider_id": string | null,"rate_cents": number,"status": Database["public"]['Enums']["shift_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "care_recipient_id"?: string | null,"caregiver_payout_cents"?: number | null,"created_at"?: string,"household_id": string,"id"?: string,"notes"?: string | null,"period": unknown,"provider_id"?: string | null,"rate_cents": number,"status"?: Database["public"]['Enums']["shift_status"]
                  }
                  Update: {
                    "care_recipient_id"?: string | null,"caregiver_payout_cents"?: number | null,"created_at"?: string,"household_id"?: string,"id"?: string,"notes"?: string | null,"period"?: unknown,"provider_id"?: string | null,"rate_cents"?: number,"status"?: Database["public"]['Enums']["shift_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "shifts_care_recipient_id_fkey"
      columns: ["care_recipient_id"]
isOneToOne: false
      referencedRelation: "care_recipients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shifts_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shifts_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "shifts_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "asaas_subscription_id": string | null,"canceled_at": string | null,"created_at": string,"current_period_end": string | null,"plan": Database["public"]['Enums']["plan_code"],"provider_id": string,"status": Database["public"]['Enums']["subscription_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "asaas_subscription_id"?: string | null,"canceled_at"?: string | null,"created_at"?: string,"current_period_end"?: string | null,"plan"?: Database["public"]['Enums']["plan_code"],"provider_id": string,"status": Database["public"]['Enums']["subscription_status"]
                  }
                  Update: {
                    "asaas_subscription_id"?: string | null,"canceled_at"?: string | null,"created_at"?: string,"current_period_end"?: string | null,"plan"?: Database["public"]['Enums']["plan_code"],"provider_id"?: string,"status"?: Database["public"]['Enums']["subscription_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: true
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "subscriptions_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: true
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"time_off": {
                  Row: {
                    "created_at": string,"id": string,"period": unknown,"provider_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"period": unknown,"provider_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"period"?: unknown,"provider_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_off_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "time_off_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "admin_metrics": {
                  Row: {
                    "entity": string | null,"status": string | null,"this_month": number | null,"this_week": number | null,"total": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"admin_open_disputes": {
                  Row: {
                    "booking_id": string | null,"client_id": string | null,"client_name": string | null,"disputed_at": string | null,"occupation_slug": string | null,"origin": Database["public"]['Enums']["booking_origin"] | null,"payment_statuses": (Database["public"]['Enums']["payment_status"])[] | null,"period": unknown,"platform_fee_cents": number | null,"price_cents": number | null,"provider_id": string | null,"provider_name": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "bookings_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_occupation_slug_fkey"
      columns: ["occupation_slug"]
isOneToOne: false
      referencedRelation: "occupations"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "bookings_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "bookings_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"admin_provider_queue": {
                  Row: {
                    "created_at": string | null,"display_name": string | null,"documents_accepted": number | null,"documents_rejected": number | null,"documents_submitted": number | null,"full_name": string | null,"occupations": (string)[] | null,"phone": string | null,"provider_id": string | null,"registries_to_review": number | null,"slug": string | null,"status": Database["public"]['Enums']["provider_status"] | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "providers_id_fkey"
      columns: ["provider_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_proposal":
{ Args: { "p_period": unknown,"p_proposal": string }; Returns: string
                           },
"accept_shift_offer":
{ Args: { "p_shift": string }; Returns: Database["public"]['Enums']["shift_status"]
                           },
"admin_resolve_dispute":
{ Args: { "p_booking": string,"p_reason": string,"p_to": Database["public"]['Enums']["booking_status"] }; Returns: Database["public"]['Enums']["booking_status"]
                           },
"admin_review_document":
{ Args: { "p_accept": boolean,"p_document": string,"p_reason"?: string }; Returns: Database["public"]['Enums']["document_status"]
                           },
"admin_set_provider_status":
{ Args: { "p_provider": string,"p_reason"?: string,"p_status": Database["public"]['Enums']["provider_status"] }; Returns: Database["public"]['Enums']["provider_status"]
                           },
"admin_set_registry_status":
{ Args: { "p_occupation": string,"p_provider": string,"p_reason"?: string,"p_status": Database["public"]['Enums']["registry_status"] }; Returns: Database["public"]['Enums']["registry_status"]
                           },
"admin_set_setting":
{ Args: { "p_key": string,"p_value": Json }; Returns: Json
                           },
"anonymize_user":
{ Args: { "p_user": string }; Returns: undefined
                           },
"available_slots":
{ Args: { "p_day": string,"p_duration_minutes": number,"p_provider": string }; Returns: (unknown)[]
                           },
"become_provider":
{ Args: { "p_display_name": string,"p_occupation": string,"p_registry_number"?: string,"p_registry_uf"?: string,"p_slug": string }; Returns: string
                           },
"book_direct":
{ Args: { "p_notes"?: string,"p_period": unknown,"p_provider": string,"p_service": string }; Returns: string
                           },
"cancel_shift":
{ Args: { "p_reason"?: string,"p_shift": string }; Returns: Database["public"]['Enums']["shift_status"]
                           },
"caregiver_shifts":
{ Args: Record<PropertyKey, never>; Returns: {
              "caregiver_payout_cents": number,"neighborhood_name": string,"notes": string,"offer_status": string,"period": unknown,"recipient_first_name": string,"shift_id": string,"status": Database["public"]['Enums']["shift_status"]
            }[]
                           },
"check_in":
{ Args: { "p_kind": string,"p_lat"?: number,"p_lng"?: number,"p_shift": string }; Returns: string
                           },
"claim_notifications":
{ Args: { "p_limit"?: number }; Returns: {
              "attempts": number,
"channel": Database["public"]['Enums']["notification_channel"],
"created_at": string,
"email": string | null,
"error": string | null,
"id": string,
"params": NonNullable<Json>,
"phone": string | null,
"scheduled_for": string,
"sent_at": string | null,
"status": Database["public"]['Enums']["notification_status"],
"template": string,
"user_id": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "notifications"
        isOneToOne: false
        isSetofReturn: true
      } },
"compute_platform_fee":
{ Args: { "p_booking": string }; Returns: number
                           },
"create_own_booking":
{ Args: { "p_notes"?: string,"p_occupation": string,"p_period": unknown,"p_price_cents": number,"p_provider_client": string }; Returns: string
                           },
"get_provider_page":
{ Args: { "p_slug": string }; Returns: Json
                           },
"get_provider_payment_secret":
{ Args: { "p_provider": string }; Returns: string
                           },
"get_quote_by_token":
{ Args: { "p_token": string }; Returns: Json
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_provider_approved":
{ Args: { "p_provider": string }; Returns: boolean
                           },
"log_event":
{ Args: { "p_action": string,"p_data"?: Json,"p_entity": string,"p_entity_id"?: string }; Returns: number
                           },
"offer_shift":
{ Args: { "p_providers": (string)[],"p_shift": string }; Returns: number
                           },
"open_requests_for_me":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"description": string,"expires_at": string,"id": string,"my_proposal_id": string,"my_proposal_status": Database["public"]['Enums']["proposal_status"],"neighborhood_id": string,"neighborhood_name": string,"occupation_slug": string,"preferred_dates": string,"proposal_count": number,"urgent": boolean
            }[]
                           },
"respond_quote":
{ Args: { "p_accept": boolean,"p_token": string }; Returns: Database["public"]['Enums']["quote_status"]
                           },
"search_providers":
{ Args: { "p_limit"?: number,"p_neighborhood"?: string,"p_occupation": string,"p_offset"?: number }; Returns: {
              "avatar_path": string,"bio": string,"display_name": string,"price_max_cents": number,"price_min_cents": number,"provider_id": string,"rating_avg": number,"rating_count": number,"registry_status": Database["public"]['Enums']["registry_status"],"slug": string,"unit": Database["public"]['Enums']["price_unit"]
            }[]
                           },
"store_provider_payment_secret":
{ Args: { "p_provider": string,"p_secret": string }; Returns: string
                           },
"submit_daily_report":
{ Args: { "p_activities"?: string,"p_meals"?: string,"p_mood"?: string,"p_notes"?: string,"p_shift": string }; Returns: string
                           },
"submit_provider_for_review":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["provider_status"]
                           },
"transition_booking":
{ Args: { "p_booking": string,"p_reason"?: string,"p_to": Database["public"]['Enums']["booking_status"] }; Returns: Database["public"]['Enums']["booking_status"]
                           }
          }
          Enums: {
            "billing_model": "comissao_primeiro_servico"|"so_assinatura"|"sob_consulta_juridica","booking_origin": "platform"|"own","booking_status": "requested"|"accepted"|"paid"|"in_progress"|"completed"|"released"|"canceled"|"disputed","consent_purpose": "terms"|"privacy"|"marketing"|"background_check"|"location","data_request_kind": "export"|"delete","document_status": "submitted"|"accepted"|"rejected","notification_channel": "whatsapp"|"email","notification_status": "queued"|"sending"|"sent"|"failed"|"skipped","payment_method": "pix"|"credit_card"|"boleto"|"undefined","payment_status": "pending"|"confirmed"|"received"|"held"|"released"|"refunded"|"failed"|"canceled","plan_code": "free"|"pro","price_unit": "hora"|"dia"|"servico"|"m2"|"sessao"|"plantao"|"mes"|"projeto"|"km"|"pacote"|"pagina"|"palavra"|"aula"|"evento"|"visita","proposal_status": "sent"|"accepted"|"declined"|"withdrawn","provider_kind": "autonomo"|"autonomo_ou_empresa"|"somente_empresa_licenciada","provider_status": "draft"|"pending_review"|"approved"|"suspended","quote_status": "draft"|"sent"|"accepted"|"declined"|"expired","registry_status": "not_required"|"informed"|"confirmed"|"rejected","request_status": "open"|"matched"|"closed"|"canceled","service_location": "domicilio"|"online"|"estabelecimento"|"empresa_cliente"|"externo","shift_status": "open"|"offered"|"assigned"|"checked_in"|"completed"|"canceled"|"no_show","subscription_status": "trialing"|"active"|"past_due"|"canceled","user_role": "client"|"provider","verification_step": "documento_selfie"|"cadastro_fiscal"|"registro_profissional"|"antecedentes"|"certificado_curso"|"cnh"|"licenca_orgao"|"seguro_rc"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "billing_model": ["comissao_primeiro_servico", "so_assinatura", "sob_consulta_juridica"],"booking_origin": ["platform", "own"],"booking_status": ["requested", "accepted", "paid", "in_progress", "completed", "released", "canceled", "disputed"],"consent_purpose": ["terms", "privacy", "marketing", "background_check", "location"],"data_request_kind": ["export", "delete"],"document_status": ["submitted", "accepted", "rejected"],"notification_channel": ["whatsapp", "email"],"notification_status": ["queued", "sending", "sent", "failed", "skipped"],"payment_method": ["pix", "credit_card", "boleto", "undefined"],"payment_status": ["pending", "confirmed", "received", "held", "released", "refunded", "failed", "canceled"],"plan_code": ["free", "pro"],"price_unit": ["hora", "dia", "servico", "m2", "sessao", "plantao", "mes", "projeto", "km", "pacote", "pagina", "palavra", "aula", "evento", "visita"],"proposal_status": ["sent", "accepted", "declined", "withdrawn"],"provider_kind": ["autonomo", "autonomo_ou_empresa", "somente_empresa_licenciada"],"provider_status": ["draft", "pending_review", "approved", "suspended"],"quote_status": ["draft", "sent", "accepted", "declined", "expired"],"registry_status": ["not_required", "informed", "confirmed", "rejected"],"request_status": ["open", "matched", "closed", "canceled"],"service_location": ["domicilio", "online", "estabelecimento", "empresa_cliente", "externo"],"shift_status": ["open", "offered", "assigned", "checked_in", "completed", "canceled", "no_show"],"subscription_status": ["trialing", "active", "past_due", "canceled"],"user_role": ["client", "provider"],"verification_step": ["documento_selfie", "cadastro_fiscal", "registro_profissional", "antecedentes", "certificado_curso", "cnh", "licenca_orgao", "seguro_rc"]
          }
        }
} as const
