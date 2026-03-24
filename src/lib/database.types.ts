export interface Database {
  public: {
    Tables: {
      bookings: {
        Row: {
          id: number
          booking_ref: string
          status: 'Booked' | 'On-Going' | 'Completed' | 'Billed' | 'Cancelled'
          customer_name: string
          booked_by_name: string | null
          booked_by_phone: string | null
          booked_by_email: string | null
          duty_type: string | null
          vehicle_group_id: number | null
          assign_alternate_vehicles: boolean
          booking_type: 'local' | 'outstation'
          is_airport_booking: boolean
          from_location: string | null
          to_location: string | null
          reporting_address: string | null
          drop_address: string | null
          start_date: string
          end_date: string
          reporting_time: string | null
          est_drop_time: string | null
          garage_start_mins: number | null
          base_rate: number | null
          extra_km_rate: number | null
          extra_hour_rate: number | null
          bill_to: string | null
          operator_notes: string | null
          driver_notes: string | null
          send_confirmation: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          customer_name: string
          start_date: string
          end_date: string
          booking_ref?: string
          status?: 'Booked' | 'On-Going' | 'Completed' | 'Billed' | 'Cancelled'
          booked_by_name?: string | null
          booked_by_phone?: string | null
          booked_by_email?: string | null
          duty_type?: string | null
          vehicle_group_id?: number | null
          assign_alternate_vehicles?: boolean
          booking_type?: 'local' | 'outstation'
          is_airport_booking?: boolean
          from_location?: string | null
          to_location?: string | null
          reporting_address?: string | null
          drop_address?: string | null
          reporting_time?: string | null
          est_drop_time?: string | null
          garage_start_mins?: number | null
          base_rate?: number | null
          extra_km_rate?: number | null
          extra_hour_rate?: number | null
          bill_to?: string | null
          operator_notes?: string | null
          driver_notes?: string | null
          send_confirmation?: boolean
        }
        Update: Partial<Database['public']['Tables']['bookings']['Insert']>
      }
      booking_passengers: {
        Row: {
          id: number
          booking_id: number
          name: string | null
          phone: string | null
          sort_order: number
        }
        Insert: {
          booking_id: number
          name?: string | null
          phone?: string | null
          sort_order?: number
        }
        Update: Partial<Database['public']['Tables']['booking_passengers']['Insert']>
      }
      drivers: {
        Row: {
          id: number
          name: string
          initials: string
          driver_id: string
          phone: string | null
          email: string | null
          status: 'Active' | 'Inactive' | 'Available' | 'Assigned' | 'Unavailable'
          date_of_birth: string | null
          pan_number: string | null
          aadhaar_number: string | null
          driver_license: string | null
          address_type: string | null
          address: string | null
          salary_per_month: number | null
          daily_wages: number | null
          shift_start_time: string | null
          shift_end_time: string | null
          off_day: string | null
          attach_document_url: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          name: string
          initials: string
          driver_id: string
          phone?: string | null
          email?: string | null
          status?: 'Active' | 'Inactive' | 'Available' | 'Assigned' | 'Unavailable'
          date_of_birth?: string | null
          pan_number?: string | null
          aadhaar_number?: string | null
          driver_license?: string | null
          address_type?: string | null
          address?: string | null
          salary_per_month?: number | null
          daily_wages?: number | null
          shift_start_time?: string | null
          shift_end_time?: string | null
          off_day?: string | null
          attach_document_url?: string | null
          notes?: string | null
        }
        Update: Partial<Database['public']['Tables']['drivers']['Insert']>
      }
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
