export interface Database {
  public: {
    Tables: {
      vehicle_groups: {
        Row: {
          id: number
          name: string
          description: string | null
          seating_capacity: number | null
          luggage_count: number | null
          total_vehicles: number
          created_at: string
        }
        Insert: {
          name: string
          description?: string | null
          seating_capacity?: number | null
          luggage_count?: number | null
          total_vehicles?: number
        }
        Update: {
          name?: string
          description?: string | null
          seating_capacity?: number | null
          luggage_count?: number | null
          total_vehicles?: number
        }
      }
      vehicles: {
        Row: {
          id: number
          model_name: string
          vehicle_number: string
          fuel_type: string | null
          vehicle_group_id: number | null
          assigned_driver_id: number | null
          fastag_number: string | null
          status: 'Active' | 'Inactive' | 'Assigned'
          reg_owner_name: string | null
          reg_date: string | null
          ins_company: string | null
          ins_policy_number: string | null
          ins_issue_date: string | null
          ins_due_date: string | null
          ins_premium: number | null
          ins_cover: number | null
          rto_owner_name: string | null
          rto_reg_date: string | null
          chassis_number: string | null
          engine_number: string | null
          car_expiry_date: string | null
          has_loan: boolean
          notes: string | null
          created_at: string
        }
        Insert: {
          model_name: string
          vehicle_number: string
          fuel_type?: string | null
          vehicle_group_id?: number | null
          assigned_driver_id?: number | null
          fastag_number?: string | null
          status?: 'Active' | 'Inactive' | 'Assigned'
          reg_owner_name?: string | null
          reg_date?: string | null
          ins_company?: string | null
          ins_policy_number?: string | null
          ins_issue_date?: string | null
          ins_due_date?: string | null
          ins_premium?: number | null
          ins_cover?: number | null
          rto_owner_name?: string | null
          rto_reg_date?: string | null
          chassis_number?: string | null
          engine_number?: string | null
          car_expiry_date?: string | null
          has_loan?: boolean
          notes?: string | null
        }
        Update: Partial<Database['public']['Tables']['vehicles']['Insert']>
      }
    }
  }
}
