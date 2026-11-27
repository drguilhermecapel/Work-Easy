
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
            "access_events": {
                  Row: {
                    "id": string,"method": string | null,"occurred_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"method"?: string | null,"occurred_at"?: string,"user_id": string
                  }
                  Update: {
                    "id"?: string,"method"?: string | null,"occurred_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"admins": {
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
                },"assist_usage": {
                  Row: {
                    "count": number,"user_id": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"user_id": string,"window_start": string
                  }
                  Update: {
                    "count"?: number,"user_id"?: string,"window_start"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assist_usage_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"assist_usage_events": {
                  Row: {
                    "id": number,"used_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"used_at"?: string,"user_id": string
                  }
                  Update: {
                    "id"?: never,"used_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assist_usage_events_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
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
                    "canceled_reason": string | null,"client_id": string | null,"created_at": string,"household_id": string | null,"id": string,"notes": string | null,"occupation_slug": string,"origin": Database["public"]['Enums']["booking_origin"],"period": unknown,"platform_fee_cents": number,"price_cents": number,"proposal_id": string | null,"provider_client_id": string | null,"provider_id": string | null,"request_id": string | null,"service_fee_agreed_at": string | null,"service_fee_covered_by_pro": boolean,"service_fee_offered": boolean,"service_fee_policy_version": string | null,"service_id": string | null,"status": Database["public"]['Enums']["booking_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "canceled_reason"?: string | null,"client_id"?: string | null,"created_at"?: string,"household_id"?: string | null,"id"?: string,"notes"?: string | null,"occupation_slug": string,"origin"?: Database["public"]['Enums']["booking_origin"],"period": unknown,"platform_fee_cents"?: number,"price_cents": number,"proposal_id"?: string | null,"provider_client_id"?: string | null,"provider_id"?: string | null,"request_id"?: string | null,"service_fee_agreed_at"?: string | null,"service_fee_covered_by_pro"?: boolean,"service_fee_offered"?: boolean,"service_fee_policy_version"?: string | null,"service_id"?: string | null,"status"?: Database["public"]['Enums']["booking_status"],"updated_at"?: string
                  }
                  Update: {
                    "canceled_reason"?: string | null,"client_id"?: string | null,"created_at"?: string,"household_id"?: string | null,"id"?: string,"notes"?: string | null,"occupation_slug"?: string,"origin"?: Database["public"]['Enums']["booking_origin"],"period"?: unknown,"platform_fee_cents"?: number,"price_cents"?: number,"proposal_id"?: string | null,"provider_client_id"?: string | null,"provider_id"?: string | null,"request_id"?: string | null,"service_fee_agreed_at"?: string | null,"service_fee_covered_by_pro"?: boolean,"service_fee_offered"?: boolean,"service_fee_policy_version"?: string | null,"service_id"?: string | null,"status"?: Database["public"]['Enums']["booking_status"],"updated_at"?: string
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
                    "adult_declared_at": string | null,"birth_year": number | null,"created_at": string,"emergency_contact": string | null,"first_name": string,"household_id": string,"id": string,"preferences": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "adult_declared_at"?: string | null,"birth_year"?: number | null,"created_at"?: string,"emergency_contact"?: string | null,"first_name": string,"household_id": string,"id"?: string,"preferences"?: string | null
                  }
                  Update: {
                    "adult_declared_at"?: string | null,"birth_year"?: number | null,"created_at"?: string,"emergency_contact"?: string | null,"first_name"?: string,"household_id"?: string,"id"?: string,"preferences"?: string | null
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
                },"consent_proof_links": {
                  Row: {
                    "proof_owner": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "proof_owner": string,"user_id": string
                  }
                  Update: {
                    "proof_owner"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"consent_proofs": {
                  Row: {
                    "at": string,"granted": boolean,"id": string,"proof_owner": string,"purpose": Database["public"]['Enums']["consent_purpose"],"retain_until": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at": string,"granted": boolean,"id"?: string,"proof_owner": string,"purpose": Database["public"]['Enums']["consent_purpose"],"retain_until": string,"version": string
                  }
                  Update: {
                    "at"?: string,"granted"?: boolean,"id"?: string,"proof_owner"?: string,"purpose"?: Database["public"]['Enums']["consent_purpose"],"retain_until"?: string,"version"?: string
                  }
                  Relationships: [
                    
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
                },"content_reports": {
                  Row: {
                    "created_at": string,"details": string | null,"id": string,"reason": string,"reporter_id": string | null,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"status": string,"target_id": string,"target_type": string,"target_user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"details"?: string | null,"id"?: string,"reason": string,"reporter_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string,"target_id": string,"target_type": string,"target_user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"details"?: string | null,"id"?: string,"reason"?: string,"reporter_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string,"target_id"?: string,"target_type"?: string,"target_user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_reports_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_reports_target_user_id_fkey"
      columns: ["target_user_id"]
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
                    "attempts": number,"channel": Database["public"]['Enums']["notification_channel"],"claimed_at": string | null,"created_at": string,"email": string | null,"error": string | null,"id": string,"params": NonNullable<Json>,"phone": string | null,"scheduled_for": string,"sent_at": string | null,"status": Database["public"]['Enums']["notification_status"],"template": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"channel": Database["public"]['Enums']["notification_channel"],"claimed_at"?: string | null,"created_at"?: string,"email"?: string | null,"error"?: string | null,"id"?: string,"params"?: NonNullable<Json>,"phone"?: string | null,"scheduled_for"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"template": string,"user_id"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"channel"?: Database["public"]['Enums']["notification_channel"],"claimed_at"?: string | null,"created_at"?: string,"email"?: string | null,"error"?: string | null,"id"?: string,"params"?: NonNullable<Json>,"phone"?: string | null,"scheduled_for"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"template"?: string,"user_id"?: string | null
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
      referencedRelation: "admin_payments_attention"
      referencedColumns: ["payment_id"]
    },{
      foreignKeyName: "payment_events_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_cents": number,"asaas_payment_id": string | null,"booking_id": string | null,"created_at": string,"due_date": string | null,"escrow": boolean,"id": string,"invoice_url": string | null,"method": Database["public"]['Enums']["payment_method"],"payer_id": string | null,"pix_payload": string | null,"pix_qr_code": string | null,"platform_fee_cents": number,"provider_id": string | null,"quote_id": string | null,"raw": Json | null,"received_at": string | null,"service_split_review_required": boolean,"status": Database["public"]['Enums']["payment_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"asaas_payment_id"?: string | null,"booking_id"?: string | null,"created_at"?: string,"due_date"?: string | null,"escrow"?: boolean,"id"?: string,"invoice_url"?: string | null,"method"?: Database["public"]['Enums']["payment_method"],"payer_id"?: string | null,"pix_payload"?: string | null,"pix_qr_code"?: string | null,"platform_fee_cents"?: number,"provider_id"?: string | null,"quote_id"?: string | null,"raw"?: Json | null,"received_at"?: string | null,"service_split_review_required"?: boolean,"status"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"asaas_payment_id"?: string | null,"booking_id"?: string | null,"created_at"?: string,"due_date"?: string | null,"escrow"?: boolean,"id"?: string,"invoice_url"?: string | null,"method"?: Database["public"]['Enums']["payment_method"],"payer_id"?: string | null,"pix_payload"?: string | null,"pix_qr_code"?: string | null,"platform_fee_cents"?: number,"provider_id"?: string | null,"quote_id"?: string | null,"raw"?: Json | null,"received_at"?: string | null,"service_split_review_required"?: boolean,"status"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string
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
                },"product_events": {
                  Row: {
                    "day": string | null,"event": string,"id": string,"occurred_at": string,"props": NonNullable<Json>,"subject_id": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "day"?: never,"event": string,"id"?: string,"occurred_at"?: string,"props"?: NonNullable<Json>,"subject_id"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "day"?: never,"event"?: string,"id"?: string,"occurred_at"?: string,"props"?: NonNullable<Json>,"subject_id"?: string | null,"user_id"?: string | null
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
                    "available_from": string | null,"created_at": string,"id": string,"message": string | null,"price_cents": number,"provider_id": string,"request_id": string,"service_fee_offered": boolean,"service_fee_policy_version": string | null,"status": Database["public"]['Enums']["proposal_status"],"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "available_from"?: string | null,"created_at"?: string,"id"?: string,"message"?: string | null,"price_cents": number,"provider_id"?: string,"request_id": string,"service_fee_offered"?: boolean,"service_fee_policy_version"?: string | null,"status"?: Database["public"]['Enums']["proposal_status"],"valid_until"?: string | null
                  }
                  Update: {
                    "available_from"?: string | null,"created_at"?: string,"id"?: string,"message"?: string | null,"price_cents"?: number,"provider_id"?: string,"request_id"?: string,"service_fee_offered"?: boolean,"service_fee_policy_version"?: string | null,"status"?: Database["public"]['Enums']["proposal_status"],"valid_until"?: string | null
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
                    "client_id": string | null,"cpf_cnpj": string | null,"created_at": string,"email": string | null,"id": string,"name": string,"notes": string | null,"origin": Database["public"]['Enums']["booking_origin"],"phone": string | null,"provider_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id"?: string | null,"cpf_cnpj"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"origin"?: Database["public"]['Enums']["booking_origin"],"phone"?: string | null,"provider_id": string
                  }
                  Update: {
                    "client_id"?: string | null,"cpf_cnpj"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"origin"?: Database["public"]['Enums']["booking_origin"],"phone"?: string | null,"provider_id"?: string
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
                    "created_at": string,"deletion_requested_at": string | null,"expires_at": string | null,"id": string,"provider_id": string,"rejection_reason": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["document_status"],"step": Database["public"]['Enums']["verification_step"],"storage_path": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deletion_requested_at"?: string | null,"expires_at"?: string | null,"id"?: string,"provider_id": string,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["document_status"],"step": Database["public"]['Enums']["verification_step"],"storage_path"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"deletion_requested_at"?: string | null,"expires_at"?: string | null,"id"?: string,"provider_id"?: string,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["document_status"],"step"?: Database["public"]['Enums']["verification_step"],"storage_path"?: string | null
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
                    "approved": boolean,"created_at": string,"is_primary": boolean,"occupation_slug": string,"provider_id": string,"registry_number": string | null,"registry_status": Database["public"]['Enums']["registry_status"],"registry_uf": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approved"?: boolean,"created_at"?: string,"is_primary"?: boolean,"occupation_slug": string,"provider_id": string,"registry_number"?: string | null,"registry_status"?: Database["public"]['Enums']["registry_status"],"registry_uf"?: string | null
                  }
                  Update: {
                    "approved"?: boolean,"created_at"?: string,"is_primary"?: boolean,"occupation_slug"?: string,"provider_id"?: string,"registry_number"?: string | null,"registry_status"?: Database["public"]['Enums']["registry_status"],"registry_uf"?: string | null
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
                    "api_key_secret_id": string | null,"asaas_account_id": string | null,"asaas_wallet_id": string | null,"cpf_hash": string | null,"created_at": string,"provider_id": string,"status": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "api_key_secret_id"?: string | null,"asaas_account_id"?: string | null,"asaas_wallet_id"?: string | null,"cpf_hash"?: string | null,"created_at"?: string,"provider_id": string,"status"?: string | null
                  }
                  Update: {
                    "api_key_secret_id"?: string | null,"asaas_account_id"?: string | null,"asaas_wallet_id"?: string | null,"cpf_hash"?: string | null,"created_at"?: string,"provider_id"?: string,"status"?: string | null
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
                    "accepts_platform_requests": boolean,"approved_at": string | null,"avatar_path": string | null,"base_neighborhood_id": string | null,"bio": string | null,"created_at": string,"display_name": string,"id": string,"plan": Database["public"]['Enums']["plan_code"],"slug": string,"status": Database["public"]['Enums']["provider_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "accepts_platform_requests"?: boolean,"approved_at"?: string | null,"avatar_path"?: string | null,"base_neighborhood_id"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name": string,"id": string,"plan"?: Database["public"]['Enums']["plan_code"],"slug": string,"status"?: Database["public"]['Enums']["provider_status"]
                  }
                  Update: {
                    "accepts_platform_requests"?: boolean,"approved_at"?: string | null,"avatar_path"?: string | null,"base_neighborhood_id"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string,"plan"?: Database["public"]['Enums']["plan_code"],"slug"?: string,"status"?: Database["public"]['Enums']["provider_status"]
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
                    "client_name": string | null,"client_phone": string | null,"completed_at": string | null,"created_at": string,"id": string,"items": NonNullable<Json>,"notes": string | null,"provider_client_id": string | null,"provider_id": string,"public_token": string,"status": Database["public"]['Enums']["quote_status"],"title": string,"total_cents": number,"updated_at": string,"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "client_name"?: string | null,"client_phone"?: string | null,"completed_at"?: string | null,"created_at"?: string,"id"?: string,"items"?: NonNullable<Json>,"notes"?: string | null,"provider_client_id"?: string | null,"provider_id"?: string,"public_token"?: string,"status"?: Database["public"]['Enums']["quote_status"],"title": string,"total_cents"?: number,"updated_at"?: string,"valid_until"?: string | null
                  }
                  Update: {
                    "client_name"?: string | null,"client_phone"?: string | null,"completed_at"?: string | null,"created_at"?: string,"id"?: string,"items"?: NonNullable<Json>,"notes"?: string | null,"provider_client_id"?: string | null,"provider_id"?: string,"public_token"?: string,"status"?: Database["public"]['Enums']["quote_status"],"title"?: string,"total_cents"?: number,"updated_at"?: string,"valid_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotes_provider_client_id_provider_id_fkey"
      columns: ["provider_client_id","provider_id"]
isOneToOne: false
      referencedRelation: "provider_clients"
      referencedColumns: ["id","provider_id"]
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
                },"ride_driver_inbox": {
                  Row: {
                    "driver_id": string,"revision": number
                  }
                  ComputedFields: never
                  Insert: {
                    "driver_id": string,"revision"?: number
                  }
                  Update: {
                    "driver_id"?: string,"revision"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ride_driver_inbox_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ride_drivers": {
                  Row: {
                    "environment": string,"id": string,"online": boolean,"reviewed_at": string | null,"reviewed_by": string | null,"status": string,"updated_at": string,"valid_until": string | null,"vehicle": string
                  }
                  ComputedFields: never
                  Insert: {
                    "environment": string,"id": string,"online"?: boolean,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status": string,"updated_at"?: string,"valid_until"?: string | null,"vehicle": string
                  }
                  Update: {
                    "environment"?: string,"id"?: string,"online"?: boolean,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"updated_at"?: string,"valid_until"?: string | null,"vehicle"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ride_legs": {
                  Row: {
                    "destination": string,"driver_cents": number,"driver_id": string | null,"driver_slot": unknown,"duration_minutes": number,"environment": string,"extras_cents": number,"fare_cents": number,"fee_cents": number,"id": string,"next_booking_id": string | null,"origin": string,"payer_id": string,"pickup_at": string,"quote_seq": number | null,"replaces_id": string | null,"revision": number,"ride_id": string,"route_case_id": string | null,"seq": number,"service_endpoint": string | null,"slot": unknown,"source_quote_id": string | null,"status": string,"tariff_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "destination": string,"driver_cents": number,"driver_id"?: string | null,"driver_slot"?: unknown,"duration_minutes": number,"environment": string,"extras_cents"?: number,"fare_cents": number,"fee_cents": number,"id"?: string,"next_booking_id"?: string | null,"origin": string,"payer_id": string,"pickup_at": string,"quote_seq"?: number | null,"replaces_id"?: string | null,"revision"?: number,"ride_id": string,"route_case_id"?: string | null,"seq": number,"service_endpoint"?: string | null,"slot": unknown,"source_quote_id"?: string | null,"status"?: string,"tariff_id": string,"updated_at"?: string
                  }
                  Update: {
                    "destination"?: string,"driver_cents"?: number,"driver_id"?: string | null,"driver_slot"?: unknown,"duration_minutes"?: number,"environment"?: string,"extras_cents"?: number,"fare_cents"?: number,"fee_cents"?: number,"id"?: string,"next_booking_id"?: string | null,"origin"?: string,"payer_id"?: string,"pickup_at"?: string,"quote_seq"?: number | null,"replaces_id"?: string | null,"revision"?: number,"ride_id"?: string,"route_case_id"?: string | null,"seq"?: number,"service_endpoint"?: string | null,"slot"?: unknown,"source_quote_id"?: string | null,"status"?: string,"tariff_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ride_legs_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "ride_drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ride_legs_next_booking_id_fkey"
      columns: ["next_booking_id"]
isOneToOne: false
      referencedRelation: "admin_open_disputes"
      referencedColumns: ["booking_id"]
    },{
      foreignKeyName: "ride_legs_next_booking_id_fkey"
      columns: ["next_booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ride_legs_replaces_id_fkey"
      columns: ["replaces_id"]
isOneToOne: true
      referencedRelation: "ride_legs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ride_legs_ride_id_fkey"
      columns: ["ride_id"]
isOneToOne: false
      referencedRelation: "rides"
      referencedColumns: ["id"]
    }
                  ]
                },"rides": {
                  Row: {
                    "booking_id": string | null,"created_at": string,"environment": string,"id": string,"passenger_id": string,"quote_id": string,"scheduled_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id"?: string | null,"created_at"?: string,"environment": string,"id"?: string,"passenger_id": string,"quote_id": string,"scheduled_at"?: string | null
                  }
                  Update: {
                    "booking_id"?: string | null,"created_at"?: string,"environment"?: string,"id"?: string,"passenger_id"?: string,"quote_id"?: string,"scheduled_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rides_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "admin_open_disputes"
      referencedColumns: ["booking_id"]
    },{
      foreignKeyName: "rides_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
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
                    "created_at": string,"offered_at": string,"provider_id": string,"shift_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"offered_at"?: string,"provider_id": string,"shift_id": string,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"offered_at"?: string,"provider_id"?: string,"shift_id"?: string,"status"?: string
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
    },{
      foreignKeyName: "shifts_recipient_in_household"
      columns: ["care_recipient_id","household_id"]
isOneToOne: false
      referencedRelation: "care_recipients"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"subscription_status_history": {
                  Row: {
                    "changed_at": string,"from_status": Database["public"]['Enums']["subscription_status"] | null,"id": number,"provider_id": string,"to_status": Database["public"]['Enums']["subscription_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"from_status"?: Database["public"]['Enums']["subscription_status"] | null,"id"?: never,"provider_id": string,"to_status": Database["public"]['Enums']["subscription_status"]
                  }
                  Update: {
                    "changed_at"?: string,"from_status"?: Database["public"]['Enums']["subscription_status"] | null,"id"?: never,"provider_id"?: string,"to_status"?: Database["public"]['Enums']["subscription_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_status_history_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "admin_provider_queue"
      referencedColumns: ["provider_id"]
    },{
      foreignKeyName: "subscription_status_history_provider_id_fkey"
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
                },"support_tasks": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"payload": NonNullable<Json>,"resolved_at": string | null,"resolved_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": string,"payload"?: NonNullable<Json>,"resolved_at"?: string | null,"resolved_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"payload"?: NonNullable<Json>,"resolved_at"?: string | null,"resolved_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_tasks_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
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
                },"trial_claims": {
                  Row: {
                    "claimed_at": string,"cpf_hash": string,"provider_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "claimed_at"?: string,"cpf_hash": string,"provider_id": string
                  }
                  Update: {
                    "claimed_at"?: string,"cpf_hash"?: string,"provider_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string,"origin": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_id": string,"blocker_id"?: string,"created_at"?: string,"origin": string
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string,"origin"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"waitlist_entries": {
                  Row: {
                    "created_at": string,"id": string,"neighborhood_id": string,"occupation_key": string | null,"occupation_slug": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"neighborhood_id": string,"occupation_key"?: never,"occupation_slug"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"neighborhood_id"?: string,"occupation_key"?: never,"occupation_slug"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "waitlist_entries_neighborhood_id_fkey"
      columns: ["neighborhood_id"]
isOneToOne: false
      referencedRelation: "neighborhoods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waitlist_entries_occupation_slug_fkey"
      columns: ["occupation_slug"]
isOneToOne: false
      referencedRelation: "occupations"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "waitlist_entries_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "admin_metrics": {
                  Row: {
                    "amount_cents": number | null,"entity": string | null,"last_30_days": number | null,"last_7_days": number | null,"month_amount_cents": number | null,"status": string | null,"this_month": number | null,"this_week": number | null,"total": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"admin_open_disputes": {
                  Row: {
                    "booking_id": string,"client_id": string | null,"client_name": string | null,"disputed_at": string | null,"occupation_slug": string,"origin": Database["public"]['Enums']["booking_origin"],"payment_statuses": (Database["public"]['Enums']["payment_status"])[] | null,"period": unknown,"platform_fee_cents": number,"price_cents": number,"provider_id": string | null,"provider_name": string | null
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
                },"admin_payments_attention": {
                  Row: {
                    "action": string,"amount_cents": number,"at": string,"audit_id": number,"booking_id": string | null,"data": NonNullable<Json>,"method": Database["public"]['Enums']["payment_method"],"payment_id": string,"provider_id": string | null,"status": Database["public"]['Enums']["payment_status"]
                  }
                  ComputedFields: never
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
    }
                  ]
                },"admin_provider_queue": {
                  Row: {
                    "created_at": string,"display_name": string,"documents_accepted": number | null,"documents_rejected": number | null,"documents_submitted": number | null,"full_name": string | null,"occupations": (string)[] | null,"occupations_to_approve": number | null,"phone": string | null,"provider_id": string,"registries_to_review": number | null,"slug": string,"status": Database["public"]['Enums']["provider_status"]
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
                },"my_ride_data_export": {
                  Row: {
                    "id": string | null,"mobility": Json | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "accept_proposal":
{ Args: { "p_period": unknown,"p_proposal": string }; Returns: string
                           },
"accept_service_commission":
{ Args: { "p_occupation": string,"p_version": string }; Returns: string
                           },
"accept_shift_offer":
{ Args: { "p_shift": string }; Returns: Database["public"]['Enums']["shift_status"]
                           },
"ack_ride_alert":
{ Args: { "p_attempt": number,"p_device": string,"p_leg": string }; Returns: undefined
                           },
"admin_close_service_commission":
{ Args: { "p_ends_at": string,"p_occupation": string,"p_version": string }; Returns: undefined
                           },
"admin_confirm_live_ride_cost":
{ Args: { "p_cost_cents": number,"p_leg": string,"p_operation": string,"p_reference": string }; Returns: Json
                           },
"admin_confirm_simulated_ride_cost":
{ Args: { "p_cost_cents": number,"p_leg": string,"p_operation": string,"p_reference": string }; Returns: Json
                           },
"admin_funnel_daily":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "day": string,"event": string,"events": number
            }[]
                           },
"admin_get_payment_raw":
{ Args: { "p_payment": string }; Returns: Json
                           },
"admin_list_reports":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_status"?: string }; Returns: {
              "created_at": string,"details": string,"id": string,"open_reports_on_target": number,"reason": string,"reporter_id": string,"resolution_note": string,"resolved_at": string,"status": string,"target_id": string,"target_label": string,"target_text": string,"target_type": string,"target_user_id": string
            }[]
                           },
"admin_log_document_view":
{ Args: { "p_storage_path": string }; Returns: undefined
                           },
"admin_publish_service_commission":
{ Args: { "p_occupation": string,"p_starts_at": string,"p_terms_url": string,"p_version": string }; Returns: undefined
                           },
"admin_record_ride_cost_disbursement":
{ Args: { "p_amount_cents": number,"p_leg": string,"p_operation": string,"p_reference": string }; Returns: Json
                           },
"admin_resolve_dispute":
{ Args: { "p_booking": string,"p_reason": string,"p_to": Database["public"]['Enums']["booking_status"] }; Returns: Database["public"]['Enums']["booking_status"]
                           },
"admin_resolve_report":
{ Args: { "p_note"?: string,"p_report": string,"p_status": string }; Returns: undefined
                           },
"admin_review_document":
{ Args: { "p_accept": boolean,"p_document": string,"p_reason"?: string }; Returns: Database["public"]['Enums']["document_status"]
                           },
"admin_review_payment":
{ Args: { "p_payment": string,"p_reason": string }; Returns: boolean
                           },
"admin_ride_appeals":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_ride_decide_appeal":
{ Args: { "p_evidence": string,"p_id": string,"p_lift": boolean }; Returns: boolean
                           },
"admin_ride_psp_reviews":
{ Args: { "p_leg": string }; Returns: Json
                           },
"admin_ride_restrict":
{ Args: { "p_days": number,"p_evidence": string,"p_protocol": string,"p_reason": string,"p_subject": string }; Returns: string
                           },
"admin_ride_safety_cases":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_ride_settlement":
{ Args: { "p_leg": string }; Returns: Json
                           },
"admin_ride_support_action":
{ Args: { "p_action": string,"p_code": string,"p_protocol": string }; Returns: string
                           },
"admin_ride_support_queue":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_set_occupation_approval":
{ Args: { "p_approved": boolean,"p_occupation": string,"p_provider": string,"p_reason"?: string }; Returns: boolean
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
"admin_simulate_ride_payment_event":
{ Args: { "p_amount_cents": number,"p_extras_cents"?: number,"p_kind": string,"p_leg": string,"p_operation": string }; Returns: Json
                           },
"admin_waitlist_summary":
{ Args: Record<PropertyKey, never>; Returns: {
              "entries": number,"last_entry_at": string,"neighborhood_id": string,"neighborhood_name": string,"occupation_slug": string
            }[]
                           },
"anonymize_user":
{ Args: { "p_user": string }; Returns: undefined
                           },
"available_slots":
{ Args: { "p_day": string,"p_duration_minutes": number,"p_provider": string }; Returns: (unknown)[]
                           },
"background_check_purge_candidates":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,
"deletion_requested_at": string | null,
"expires_at": string | null,
"id": string,
"provider_id": string,
"rejection_reason": string | null,
"reviewed_at": string | null,
"reviewed_by": string | null,
"status": Database["public"]['Enums']["document_status"],
"step": Database["public"]['Enums']["verification_step"],
"storage_path": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "provider_documents"
        isOneToOne: false
        isSetofReturn: true
      } },
"become_provider":
{ Args: { "p_display_name": string,"p_occupation": string,"p_registry_number"?: string,"p_registry_uf"?: string,"p_slug": string }; Returns: string
                           },
"block_provider":
{ Args: { "p_provider": string }; Returns: undefined
                           },
"block_request_author":
{ Args: { "p_request": string }; Returns: undefined
                           },
"book_direct":
{ Args: { "p_notes"?: string,"p_period": unknown,"p_provider": string,"p_service": string }; Returns: string
                           },
"cancel_shift":
{ Args: { "p_reason"?: string,"p_shift": string }; Returns: Database["public"]['Enums']["shift_status"]
                           },
"cancel_shifts_for_user_deletion":
{ Args: { "p_user": string }; Returns: number
                           },
"cancel_unpaid_accepted_bookings_for_user":
{ Args: { "p_user": string }; Returns: number
                           },
"care_access":
{ Args: Record<PropertyKey, never>; Returns: boolean
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
"claimed_at": string | null,
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
"claim_ride_alerts":
{ Args: Record<PropertyKey, never>; Returns: {
              "attempt": number,"device": string,"leg": string,"token": string,"transport": string
            }[]
                           },
"claim_ride_live_account":
{ Args: { "p_leg": string }; Returns: Json
                           },
"claim_ride_sandbox_account":
{ Args: { "p_leg": string }; Returns: Json
                           },
"compute_platform_fee":
{ Args: { "p_booking": string }; Returns: number
                           },
"create_own_booking":
{ Args: { "p_notes"?: string,"p_occupation": string,"p_period": unknown,"p_price_cents": number,"p_provider_client": string }; Returns: string
                           },
"custom_access_token_hook":
{ Args: { "event": Json }; Returns: Json
                           },
"driver_airport_queue":
{ Args: { "p_accuracy": number,"p_join": boolean,"p_lat": number,"p_lng": number,"p_terminal": string }; Returns: undefined
                           },
"driver_decide_offer":
{ Args: { "p_accept": boolean,"p_expires": string,"p_key": string,"p_leg": string }; Returns: Json
                           },
"driver_navigation":
{ Args: { "p_leg": string }; Returns: Json
                           },
"driver_opportunities":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"driver_preferences":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"driver_reach_waypoint":
{ Args: { "p_index": number,"p_leg": string }; Returns: number
                           },
"driver_release_reservation":
{ Args: { "p_key": string,"p_leg": string,"p_no_show"?: boolean }; Returns: undefined
                           },
"driver_save_preferences":
{ Args: { "p_arrive_by": string,"p_cost_per_km": number,"p_destination": string }; Returns: undefined
                           },
"export_ride_municipal":
{ Args: { "p_after": string,"p_from": string,"p_limit": number,"p_until": string }; Returns: Json
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
"mark_background_check_purged":
{ Args: { "p_id": string }; Returns: undefined
                           },
"mark_quote_completed":
{ Args: { "p_done"?: boolean,"p_quote": string }; Returns: string
                           },
"my_blocks":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"label": string,"origin": string,"ref": string
            }[]
                           },
"offer_shift":
{ Args: { "p_providers": (string)[],"p_shift": string }; Returns: number
                           },
"open_requests_for_me":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"description": string,"expires_at": string,"id": string,"my_proposal_id": string,"my_proposal_status": Database["public"]['Enums']["proposal_status"],"neighborhood_id": string,"neighborhood_name": string,"occupation_slug": string,"preferred_dates": string,"proposal_count": number,"urgent": boolean
            }[]
                           },
"open_support_task":
{ Args: { "p_kind": string,"p_payload": Json }; Returns: string
                           },
"record_ride_driver_reward":
{ Args: { "p_campaign": string,"p_cents": number,"p_kind": string,"p_leg": string,"p_operation": string,"p_reference": string }; Returns: undefined
                           },
"record_ride_sandbox_financial_event":
{ Args: { "p_amount_cents": number,"p_extras_cents"?: number,"p_kind": string,"p_leg": string,"p_operation": string }; Returns: Json
                           },
"record_verified_live_ride_event":
{ Args: { "p_amount_cents": number,"p_driver_split_cents"?: number,"p_extras_cents"?: number,"p_kind": string,"p_leg": string,"p_operation": string,"p_psp_fee_cents"?: number }; Returns: Json
                           },
"report_content":
{ Args: { "p_details"?: string,"p_reason": string,"p_target": string,"p_type": string }; Returns: string
                           },
"report_review":
{ Args: { "p_created_at": string,"p_details"?: string,"p_provider": string,"p_reason": string }; Returns: string
                           },
"respond_quote":
{ Args: { "p_accept": boolean,"p_expected_total_cents"?: number,"p_token": string }; Returns: Database["public"]['Enums']["quote_status"]
                           },
"ride_accept_offer":
{ Args: { "p_key": string,"p_leg": string }; Returns: Json
                           },
"ride_aftercare":
{ Args: { "p_leg": string }; Returns: Json
                           },
"ride_amendment_state":
{ Args: { "p_leg": string }; Returns: Json
                           },
"ride_appeal":
{ Args: { "p_id": string,"p_reason": string }; Returns: boolean
                           },
"ride_apply_driver":
{ Args: { "p_vehicle": string }; Returns: Json
                           },
"ride_attach_incident":
{ Args: { "p_content": string,"p_key": string,"p_mime": string,"p_protocol": string }; Returns: string
                           },
"ride_begin_dossier":
{ Args: { "p_model": string,"p_name": string,"p_number": string,"p_plate": string,"p_version": string }; Returns: string
                           },
"ride_block_pair":
{ Args: { "p_enable": boolean,"p_leg": string }; Returns: boolean
                           },
"ride_can_transmit":
{ Args: { "p_leg": string }; Returns: boolean
                           },
"ride_case_update":
{ Args: { "p_code": string,"p_key": string,"p_protocol": string,"p_reference": string }; Returns: string
                           },
"ride_chat_send":
{ Args: { "p_key": string,"p_leg": string,"p_text": string }; Returns: string
                           },
"ride_choose_class":
{ Args: { "p_code": string,"p_departure"?: string,"p_route": string }; Returns: undefined
                           },
"ride_claim_route":
{ Args: { "p_route": string }; Returns: Json
                           },
"ride_class_options":
{ Args: { "p_departure"?: string,"p_route": string }; Returns: Json
                           },
"ride_close_observation":
{ Args: { "p_completed": boolean,"p_margin_cents": number,"p_reference": string,"p_support_minutes": number }; Returns: undefined
                           },
"ride_communication":
{ Args: { "p_leg": string }; Returns: Json
                           },
"ride_complete_route":
{ Args: { "p_destination": Json,"p_origin": Json,"p_route": string }; Returns: Json
                           },
"ride_configure_shift":
{ Args: { "p_area": string,"p_from": string,"p_until": string }; Returns: Json
                           },
"ride_consent":
{ Args: { "p_accept": boolean,"p_quote": string }; Returns: Json
                           },
"ride_dashboard":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ride_dashboard_before_waves":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ride_decide_amendment":
{ Args: { "p_accept": boolean,"p_change": string }; Returns: Json
                           },
"ride_decide_dossier":
{ Args: { "p_approve": boolean,"p_dossier": string,"p_driver_until": string,"p_insurance_until": string,"p_reason": string,"p_vehicle_until": string }; Returns: boolean
                           },
"ride_decline_offer":
{ Args: { "p_key": string,"p_leg": string }; Returns: Json
                           },
"ride_device":
{ Args: { "p_enable": boolean,"p_token": string,"p_transport": string }; Returns: undefined
                           },
"ride_dossier":
{ Args: { "p_driver"?: string }; Returns: Json
                           },
"ride_dossier_attach":
{ Args: { "p_dossier": string,"p_driver": string,"p_kind": string,"p_path": string }; Returns: string
                           },
"ride_dossier_expired_files":
{ Args: Record<PropertyKey, never>; Returns: {
              "path": string
            }[]
                           },
"ride_dossier_file_path":
{ Args: { "p_file": string,"p_leg"?: string }; Returns: string
                           },
"ride_dossier_upload_target":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"ride_driver_diary":
{ Args: { "p_cost_cents": number,"p_day": string,"p_empty_meters": number,"p_paid_meters": number }; Returns: boolean
                           },
"ride_driver_statement":
{ Args: { "p_day": string,"p_week"?: boolean }; Returns: Json
                           },
"ride_enroll":
{ Args: { "p_market": string,"p_reference": string,"p_stratum": string }; Returns: string
                           },
"ride_export_before_safety":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ride_export_my_data":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ride_forget_place":
{ Args: { "p_id": string }; Returns: undefined
                           },
"ride_incident_file":
{ Args: { "p_id": string }; Returns: Json
                           },
"ride_issue_pin":
{ Args: { "p_leg": string }; Returns: Json
                           },
"ride_leg_points":
{ Args: { "p_leg": string }; Returns: Json
                           },
"ride_live_claim_send":
{ Args: { "p_leg": string }; Returns: boolean
                           },
"ride_live_find_charge":
{ Args: { "p_leg": string }; Returns: Json
                           },
"ride_live_observe_charge":
{ Args: { "p_amount": number,"p_customer": string,"p_fee": number,"p_invoice": string,"p_leg": string,"p_payment": string,"p_payout": number,"p_reason": string,"p_refunded": number,"p_reversal": number,"p_split": number,"p_status": string }; Returns: Json
                           },
"ride_live_payment_view":
{ Args: { "p_leg": string }; Returns: Json
                           },
"ride_live_prepare_charge":
{ Args: { "p_leg": string,"p_user": string }; Returns: Json
                           },
"ride_mark_at_pickup":
{ Args: { "p_leg": string }; Returns: string
                           },
"ride_measure_commit":
{ Args: { "p_geometry": Json,"p_meters": number,"p_minutes": number,"p_route": string,"p_user": string,"p_version": number }; Returns: boolean
                           },
"ride_measure_input":
{ Args: { "p_route": string,"p_user": string }; Returns: Json
                           },
"ride_my_places":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ride_navigation_data":
{ Args: { "p_leg": string }; Returns: Json
                           },
"ride_offer_assistance":
{ Args: { "p_leg": string }; Returns: string
                           },
"ride_open_help":
{ Args: { "p_leg": string,"p_reason": string }; Returns: string
                           },
"ride_passenger_updates":
{ Args: { "p_forward"?: boolean }; Returns: Json
                           },
"ride_pickup_cue":
{ Args: { "p_key": string,"p_leg": string }; Returns: boolean
                           },
"ride_pilot_report":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ride_prepare_route":
{ Args: { "p_booking": string,"p_destination": Json,"p_destination_area": string,"p_key": string,"p_origin": Json,"p_origin_area": string,"p_service_endpoint": string }; Returns: Json
                           },
"ride_progress":
{ Args: { "p_leg": string }; Returns: Json
                           },
"ride_propose_amendment":
{ Args: { "p_key": string,"p_leg": string,"p_pickup_at"?: string,"p_route": string }; Returns: Json
                           },
"ride_purge_dossier_rows":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"ride_push_ready":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"ride_quote":
{ Args: { "p_booking": string,"p_key": string,"p_legs": Json,"p_scheduled_at": string }; Returns: Json
                           },
"ride_quote_with_access":
{ Args: { "p_assistance": string,"p_booking": string,"p_key": string,"p_legs": Json,"p_scheduled_at": string }; Returns: Json
                           },
"ride_rate":
{ Args: { "p_leg": string,"p_stars": number }; Returns: undefined
                           },
"ride_rate_pair":
{ Args: { "p_leg": string,"p_stars": number }; Returns: boolean
                           },
"ride_read_cue":
{ Args: { "p_leg": string }; Returns: Json
                           },
"ride_recording_notice":
{ Args: { "p_agree": boolean,"p_leg": string }; Returns: boolean
                           },
"ride_recover_pin":
{ Args: { "p_leg": string,"p_proof": string,"p_protocol": string }; Returns: Json
                           },
"ride_register_interest":
{ Args: { "p_leg": string }; Returns: undefined
                           },
"ride_remove_shift":
{ Args: { "p_shift": string }; Returns: Json
                           },
"ride_report_eta":
{ Args: { "p_leg": string,"p_minutes": number }; Returns: undefined
                           },
"ride_resolve":
{ Args: { "p_key": string,"p_leg": string,"p_to": string }; Returns: Json
                           },
"ride_resolve_with_evidence":
{ Args: { "p_boarded_at": string,"p_ended_at": string,"p_evidence_ref": string,"p_key": string,"p_leg": string }; Returns: Json
                           },
"ride_review_driver":
{ Args: { "p_approve": boolean,"p_driver": string,"p_valid_until": string }; Returns: Json
                           },
"ride_route_cases":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ride_route_detail":
{ Args: { "p_route": string }; Returns: Json
                           },
"ride_route_waypoints":
{ Args: { "p_instruction": string,"p_route": string,"p_stops": Json }; Returns: undefined
                           },
"ride_safety_case":
{ Args: { "p_category": string,"p_key": string,"p_leg": string,"p_parent"?: string }; Returns: string
                           },
"ride_safety_status":
{ Args: { "p_leg": string }; Returns: Json
                           },
"ride_sandbox_claim_send":
{ Args: { "p_leg": string }; Returns: boolean
                           },
"ride_sandbox_find_charge":
{ Args: { "p_leg": string }; Returns: Json
                           },
"ride_sandbox_observe_charge":
{ Args: { "p_amount": number,"p_customer": string,"p_invoice": string,"p_leg": string,"p_payment": string,"p_refunded": number,"p_status": string }; Returns: Json
                           },
"ride_sandbox_payment_view":
{ Args: { "p_leg": string }; Returns: Json
                           },
"ride_sandbox_prepare_charge":
{ Args: { "p_leg": string,"p_user": string }; Returns: Json
                           },
"ride_search_places":
{ Args: { "p_area"?: string,"p_search": string }; Returns: Json
                           },
"ride_send_position":
{ Args: { "p_accuracy": number,"p_at": string,"p_lat": number,"p_leg": string,"p_lng": number }; Returns: boolean
                           },
"ride_set_access":
{ Args: { "p_assistance": string,"p_cue": string,"p_leg": string,"p_share": boolean }; Returns: Json
                           },
"ride_set_online":
{ Args: { "p_online": boolean }; Returns: Json
                           },
"ride_share_invite":
{ Args: { "p_email": string,"p_leg": string,"p_minutes": number }; Returns: Json
                           },
"ride_share_revoke":
{ Args: { "p_id": string }; Returns: boolean
                           },
"ride_shared_progress":
{ Args: { "p_token": string }; Returns: Json
                           },
"ride_store_place":
{ Args: { "p_kind": string,"p_point": Json }; Returns: string
                           },
"ride_submit_dossier":
{ Args: { "p_dossier": string }; Returns: boolean
                           },
"ride_support_contact":
{ Args: { "p_leg": string }; Returns: Json
                           },
"ride_transition":
{ Args: { "p_key": string,"p_leg": string,"p_to": string }; Returns: Json
                           },
"ride_trip_driver_identity":
{ Args: { "p_leg": string }; Returns: Json
                           },
"ride_trust_overview":
{ Args: { "p_leg": string }; Returns: Json
                           },
"ride_validate_capacity":
{ Args: { "p_accessible": boolean,"p_driver": string,"p_reference": string,"p_seats": number,"p_tools": boolean,"p_until": string }; Returns: undefined
                           },
"ride_verify_boarding":
{ Args: { "p_key": string,"p_leg": string,"p_pin": string }; Returns: Json
                           },
"ride_verify_route":
{ Args: { "p_meters": number,"p_minutes": number,"p_reference": string,"p_route": string }; Returns: Json
                           },
"ride_wellness_ack":
{ Args: { "p_leg": string }; Returns: boolean
                           },
"run_retention_purge":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"search_providers":
{ Args: { "p_limit"?: number,"p_neighborhood"?: string,"p_occupation": string,"p_offset"?: number }; Returns: {
              "avatar_path": string,"bio": string,"display_name": string,"price_max_cents": number,"price_min_cents": number,"provider_id": string,"rating_avg": number,"rating_count": number,"registry_status": Database["public"]['Enums']["registry_status"],"slug": string,"unit": Database["public"]['Enums']["price_unit"]
            }[]
                           },
"service_commission_options":
{ Args: Record<PropertyKey, never>; Returns: {
              "accepted_at": string,"applies_from": string,"charging_enabled": boolean,"occupation_slug": string,"terms_reference": string,"version": string
            }[]
                           },
"service_pro_sales_allowed":
{ Args: { "p_provider": string }; Returns: boolean
                           },
"slug_available":
{ Args: { "p_slug": string }; Returns: boolean
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
"take_assist_quota":
{ Args: { "p_limit": number,"p_user": string }; Returns: boolean
                           },
"transition_booking":
{ Args: { "p_booking": string,"p_reason"?: string,"p_to": Database["public"]['Enums']["booking_status"] }; Returns: Database["public"]['Enums']["booking_status"]
                           },
"unblock_user":
{ Args: { "p_blocked": string }; Returns: undefined
                           },
"withdraw_background_check":
{ Args: { "p_version": string }; Returns: number
                           }
          }
          Enums: {
            "billing_model": "comissao_primeiro_servico"|"so_assinatura"|"sob_consulta_juridica","booking_origin": "platform"|"own","booking_status": "requested"|"accepted"|"paid"|"in_progress"|"completed"|"released"|"canceled"|"disputed","consent_purpose": "terms"|"privacy"|"marketing"|"background_check"|"location"|"age_declaration"|"ai_assist","data_request_kind": "export"|"delete","document_status": "submitted"|"accepted"|"rejected"|"purged","notification_channel": "whatsapp"|"email","notification_status": "queued"|"sending"|"sent"|"failed"|"skipped","payment_method": "pix"|"credit_card"|"boleto"|"undefined","payment_status": "pending"|"confirmed"|"received"|"held"|"released"|"refunded"|"failed"|"canceled","plan_code": "free"|"pro","price_unit": "hora"|"dia"|"servico"|"m2"|"sessao"|"plantao"|"mes"|"projeto"|"km"|"pacote"|"pagina"|"palavra"|"aula"|"evento"|"visita","proposal_status": "sent"|"accepted"|"declined"|"withdrawn","provider_kind": "autonomo"|"autonomo_ou_empresa"|"somente_empresa_licenciada","provider_status": "draft"|"pending_review"|"approved"|"suspended","quote_status": "draft"|"sent"|"accepted"|"declined"|"expired","registry_status": "not_required"|"informed"|"confirmed"|"rejected","request_status": "open"|"matched"|"closed"|"canceled","service_location": "domicilio"|"online"|"estabelecimento"|"empresa_cliente"|"externo","shift_status": "open"|"offered"|"assigned"|"checked_in"|"completed"|"canceled"|"no_show","subscription_status": "pending"|"trialing"|"active"|"past_due"|"canceled","user_role": "client"|"provider","verification_step": "documento_selfie"|"cadastro_fiscal"|"registro_profissional"|"antecedentes"|"certificado_curso"|"cnh"|"licenca_orgao"|"seguro_rc"
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
            "billing_model": ["comissao_primeiro_servico", "so_assinatura", "sob_consulta_juridica"],"booking_origin": ["platform", "own"],"booking_status": ["requested", "accepted", "paid", "in_progress", "completed", "released", "canceled", "disputed"],"consent_purpose": ["terms", "privacy", "marketing", "background_check", "location", "age_declaration", "ai_assist"],"data_request_kind": ["export", "delete"],"document_status": ["submitted", "accepted", "rejected", "purged"],"notification_channel": ["whatsapp", "email"],"notification_status": ["queued", "sending", "sent", "failed", "skipped"],"payment_method": ["pix", "credit_card", "boleto", "undefined"],"payment_status": ["pending", "confirmed", "received", "held", "released", "refunded", "failed", "canceled"],"plan_code": ["free", "pro"],"price_unit": ["hora", "dia", "servico", "m2", "sessao", "plantao", "mes", "projeto", "km", "pacote", "pagina", "palavra", "aula", "evento", "visita"],"proposal_status": ["sent", "accepted", "declined", "withdrawn"],"provider_kind": ["autonomo", "autonomo_ou_empresa", "somente_empresa_licenciada"],"provider_status": ["draft", "pending_review", "approved", "suspended"],"quote_status": ["draft", "sent", "accepted", "declined", "expired"],"registry_status": ["not_required", "informed", "confirmed", "rejected"],"request_status": ["open", "matched", "closed", "canceled"],"service_location": ["domicilio", "online", "estabelecimento", "empresa_cliente", "externo"],"shift_status": ["open", "offered", "assigned", "checked_in", "completed", "canceled", "no_show"],"subscription_status": ["pending", "trialing", "active", "past_due", "canceled"],"user_role": ["client", "provider"],"verification_step": ["documento_selfie", "cadastro_fiscal", "registro_profissional", "antecedentes", "certificado_curso", "cnh", "licenca_orgao", "seguro_rc"]
          }
        }
} as const
