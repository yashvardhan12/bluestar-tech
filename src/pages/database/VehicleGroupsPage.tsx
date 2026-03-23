import { useState, useRef, useEffect } from 'react'
import { Search, Plus, Trash2, MoreHorizontal, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import Drawer from '../../components/ui/Drawer'

interface VehicleGroup {
  id: number
  name: string
  totalVehicles: number
}

const INITIAL_VEHICLE_GROUPS: VehicleGroup[] = [
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

const PAGE_SIZE = 8

function getPaginationPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 3) return [1, 2, 3, '...', total - 2, total - 1, total]
  if (current >= total - 2) return [1, 2, 3, '...', total - 2, total - 1, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
}

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer"
    />
  )
}

const EMPTY_FORM = { name: '', description: '', seatingCapacity: '', luggageCount: '' }

export default function VehicleGroupsPage() {
  const [rows, setRows] = useState(INITIAL_VEHICLE_GROUPS)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(1)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const filtered = rows.filter(vg =>
    vg.name.toLowerCase().includes(search.toLowerCase()),
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const allSelected = pageRows.length > 0 && pageRows.every(r => selected.has(r.id))
  const someSelected = pageRows.some(r => selected.has(r.id)) && !allSelected

  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) pageRows.forEach(r => next.delete(r.id))
      else pageRows.forEach(r => next.add(r.id))
      return next
    })
  }

  function toggleRow(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function openDrawer() {
    setForm(EMPTY_FORM)
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
  }

  function handleSave() {
    if (!form.name.trim()) return
    const newGroup: VehicleGroup = {
      id: Date.now(),
      name: form.name.trim(),
      totalVehicles: 0,
    }
    setRows(prev => [newGroup, ...prev])
    closeDrawer()
  }

  return (
    <div className="px-10 py-7 flex flex-col gap-6">

      {/* Section header */}
      <div className="border-b border-gray-200 pb-5 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-medium leading-[38px] text-gray-900">Vehicle groups</h2>
          <p className="text-base font-normal text-gray-500 leading-6">
            Create and manage your vehicle groups here
          </p>
        </div>

        {/* Search */}
        <div className="relative w-[400px] shrink-0">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-gray-400 pointer-events-none"
            strokeWidth={1.75}
          />
          <input
            type="text"
            placeholder="Search by vehicle group name"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-[42px] pr-3.5 py-2.5 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-base text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
          />
        </div>

        {/* Add button */}
        <button
          onClick={openDrawer}
          className="flex items-center gap-1.5 px-3.5 py-2.5 bg-[#7f56d9] text-white text-sm font-semibold rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] cursor-pointer hover:bg-[#6941c6] transition-colors shrink-0"
        >
          <Plus className="size-5" strokeWidth={2} />
          Add vehicle group
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="h-[44px] px-6 text-left border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <IndeterminateCheckbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleAll}
                  />
                  <button className="flex items-center gap-1 text-xs font-medium text-gray-600 cursor-pointer hover:text-gray-900 transition-colors">
                    Name
                    <ChevronDown className="size-4 shrink-0" strokeWidth={1.75} />
                  </button>
                </div>
              </th>
              <th className="h-[44px] px-6 text-left w-[240px] border-b border-gray-200">
                <span className="text-xs font-medium text-gray-600">Total vehicles</span>
              </th>
              <th className="h-[44px] w-[68px] border-b border-gray-200" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map(row => (
              <tr
                key={row.id}
                className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <td className="h-[72px] px-6 py-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      className="size-4 rounded border-gray-300 accent-violet-600 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-gray-900">{row.name}</span>
                  </div>
                </td>
                <td className="h-[72px] px-6 py-4 text-sm font-normal text-gray-500">
                  {row.totalVehicles}
                </td>
                <td className="h-[72px] p-4">
                  <div className="flex items-center gap-1">
                    <button className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-100 transition-colors cursor-pointer">
                      <Trash2 className="size-5" strokeWidth={1.75} />
                    </button>
                    <button className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer">
                      <MoreHorizontal className="size-5" strokeWidth={1.75} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {pageRows.length === 0 && (
              <tr>
                <td colSpan={3} className="py-16 text-center text-sm text-gray-400">
                  No vehicle groups match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="border-t border-gray-200 flex items-center justify-between px-6 pt-3 pb-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <ChevronLeft className="size-5" strokeWidth={1.75} />
            Previous
          </button>

          <div className="flex items-center gap-0.5">
            {getPaginationPages(page, totalPages).map((p, i) => (
              <button
                key={i}
                onClick={() => typeof p === 'number' && setPage(p)}
                disabled={p === '...'}
                className={clsx(
                  'size-10 rounded-lg text-sm font-medium flex items-center justify-center transition-colors',
                  p === page
                    ? 'bg-gray-50 text-gray-900 font-semibold'
                    : 'text-gray-600 hover:bg-gray-50',
                  p === '...' && 'cursor-default pointer-events-none',
                )}
              >
                {p}
              </button>
            ))}
          </div>

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            Next
            <ChevronRight className="size-5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Add Vehicle Group Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title="Vehicle Group"
        description="Add details of your vehicle group"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={closeDrawer}
              className="px-3.5 py-2.5 border border-gray-300 rounded-lg bg-white text-sm font-semibold text-gray-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-3.5 py-2.5 bg-[#7f56d9] text-white text-sm font-semibold rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] hover:bg-[#6941c6] transition-colors cursor-pointer"
            >
              Save
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-0.5 text-sm font-medium text-gray-700">
              Name
              <span className="text-violet-600">*</span>
            </label>
            <input
              type="text"
              placeholder="Toyota Innova"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-base text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              placeholder="Enter a description..."
              rows={5}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3.5 py-3 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-base text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow resize-y"
            />
          </div>

          {/* Seating Capacity */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">
              Seating Capacity (excluding driver)
            </label>
            <input
              type="number"
              placeholder="4"
              value={form.seatingCapacity}
              onChange={e => setForm(f => ({ ...f, seatingCapacity: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-base text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
            />
          </div>

          {/* Luggage Count */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Luggage count</label>
            <input
              type="number"
              placeholder="2"
              value={form.luggageCount}
              onChange={e => setForm(f => ({ ...f, luggageCount: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] text-base text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 transition-shadow"
            />
          </div>
        </div>
      </Drawer>
    </div>
  )
}
