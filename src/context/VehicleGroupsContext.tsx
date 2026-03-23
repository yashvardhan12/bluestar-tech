import { createContext, useContext, useState } from 'react'

export interface VehicleGroup {
  id: number
  name: string
  totalVehicles: number
}

const INITIAL: VehicleGroup[] = [
  { id: 1,  name: 'Toyota Innova',      totalVehicles: 2 },
  { id: 2,  name: 'Dzire/Amaze/Etios',  totalVehicles: 3 },
  { id: 3,  name: 'Nissan Hatchbacks',  totalVehicles: 2 },
  { id: 4,  name: 'MG Hector/MG Titan', totalVehicles: 4 },
  { id: 5,  name: 'Mercedes Sedans',    totalVehicles: 5 },
  { id: 6,  name: 'Toyota Sedans',      totalVehicles: 1 },
  { id: 7,  name: 'Maruti Hatchbacks',  totalVehicles: 2 },
  { id: 8,  name: 'Maruti SUVs',        totalVehicles: 4 },
  { id: 9,  name: 'Honda City',         totalVehicles: 3 },
  { id: 10, name: 'Hyundai Creta',      totalVehicles: 6 },
]

interface VehicleGroupsContextValue {
  groups: VehicleGroup[]
  addGroup: (group: VehicleGroup) => void
}

const VehicleGroupsContext = createContext<VehicleGroupsContextValue | null>(null)

export function VehicleGroupsProvider({ children }: { children: React.ReactNode }) {
  const [groups, setGroups] = useState<VehicleGroup[]>(INITIAL)

  function addGroup(group: VehicleGroup) {
    setGroups(prev => [group, ...prev])
  }

  return (
    <VehicleGroupsContext.Provider value={{ groups, addGroup }}>
      {children}
    </VehicleGroupsContext.Provider>
  )
}

export function useVehicleGroups() {
  const ctx = useContext(VehicleGroupsContext)
  if (!ctx) throw new Error('useVehicleGroups must be used inside VehicleGroupsProvider')
  return ctx
}
