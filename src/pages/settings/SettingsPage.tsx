import { useState, useEffect, useRef } from 'react'
import { Search, Plus, MoreHorizontal, Pencil, Trash2, ChevronDown, ChevronRight, Mail } from 'lucide-react'
import { clsx } from 'clsx'
import Drawer from '../../components/ui/Drawer'
import FileUpload from '../../components/ui/FileUpload'
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/ui/Toast'

// ── types ──────────────────────────────────────────────────────────────────────

type Tab = 'account' | 'team' | 'companies'
type TeamRole = 'Owner' | 'Admin' | 'Manager' | 'Staff'
type DrawerMode = 'add' | 'edit'

interface UserProfile {
  id: number
  firstName: string
  lastName: string
  email: string
  role: string
  accessType: TeamRole
}

interface TeamMember {
  id: number
  name: string
  phoneNumber: string
  email: string | null
  address: string | null
  notes: string | null
  role: TeamRole
}

interface Company {
  id: number
  name: string
  phoneNumber: string
  email: string | null
  address: string | null
  businessType: string | null
  gstinNumber: string | null
  serviceTaxNumber: string | null
  cinNumber: string | null
  cstTinNumber: string | null
  dutySlipTerms: string | null
  signatureUrl: string | null
  notes: string | null
}

// ── helpers ────────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const ROLE_STYLES: Record<TeamRole, string> = {
  Owner:   'bg-gray-50 border border-gray-200 text-gray-700',
  Admin:   'bg-green-50 border border-green-200 text-green-700',
  Manager: 'bg-blue-50 border border-blue-200 text-blue-700',
  Staff:   'bg-purple-50 border border-purple-200 text-purple-700',
}

function RoleBadge({ role }: { role: TeamRole }) {
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', ROLE_STYLES[role])}>
      {role}
    </span>
  )
}

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
]

function Avatar({ name, index }: { name: string; index: number }) {
  const colorClass = AVATAR_COLORS[index % AVATAR_COLORS.length]
  return (
    <div className={clsx('size-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0', colorClass)}>
      {getInitials(name)}
    </div>
  )
}

// ── actions menu ───────────────────────────────────────────────────────────────

function ActionsMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-36 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden py-1">
          <button
            type="button"
            onClick={() => { setOpen(false); onEdit() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <Pencil className="size-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onDelete() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <Trash2 className="size-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const INPUT_CLS = 'w-full h-10 px-3.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-600 focus:border-violet-600 bg-white'
const TEXTAREA_CLS = 'w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-600 focus:border-violet-600 bg-white resize-none'

// ── ACCOUNT TAB ───────────────────────────────────────────────────────────────

const DISABLED_INPUT = 'w-full h-10 px-3.5 rounded-lg border border-gray-300 text-sm bg-gray-50 text-gray-500 cursor-not-allowed shadow-xs'
const ACTIVE_INPUT   = 'w-full h-10 px-3.5 rounded-lg border border-gray-300 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-600 focus:border-violet-600 shadow-xs'
const ICON_INPUT_WRAP = 'relative w-full'
const ICON_INPUT_DISABLED = 'w-full h-10 pl-10 pr-3.5 rounded-lg border border-gray-300 text-sm bg-gray-50 text-gray-500 cursor-not-allowed shadow-xs'
const ICON_INPUT_ACTIVE   = 'w-full h-10 pl-10 pr-3.5 rounded-lg border border-gray-300 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-600 focus:border-violet-600 shadow-xs'

function AccountRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="flex items-start gap-8 py-5">
        <span className="shrink-0 w-[200px] text-sm font-semibold text-gray-700 pt-2.5">{label}</span>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
      <div className="h-px bg-[#e4e7ec]" />
    </>
  )
}

function AccountTab() {
  const { showToast } = useToast()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', role: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      let { data } = await supabase
        .from('user_profiles')
        .select('*')
        .order('id')
        .limit(1)
        .maybeSingle()

      if (!data) {
        const { data: inserted } = await supabase
          .from('user_profiles')
          .insert({ first_name: '', last_name: '', email: '', role: '', access_type: 'Owner' })
          .select()
          .single()
        data = inserted
      }

      if (data) {
        const p: UserProfile = {
          id: data.id,
          firstName: data.first_name,
          lastName: data.last_name,
          email: data.email,
          role: data.role,
          accessType: data.access_type as TeamRole,
        }
        setProfile(p)
        setForm({ firstName: p.firstName, lastName: p.lastName, email: p.email, role: p.role })
      }
    }
    load()
  }, [])

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    const { error } = await supabase
      .from('user_profiles')
      .update({ first_name: form.firstName, last_name: form.lastName, email: form.email, role: form.role })
      .eq('id', profile.id)
    setSaving(false)
    if (error) { showToast('Error saving profile'); return }
    setProfile(p => p ? { ...p, ...form } : p)
    setEditing(false)
    showToast('Profile updated')
  }

  function handleCancel() {
    if (profile) setForm({ firstName: profile.firstName, lastName: profile.lastName, email: profile.email, role: profile.role })
    setEditing(false)
  }

  return (
    <div className="w-full max-w-3xl flex flex-col gap-6">

      {/* Personal info section */}
      <div>
        {/* Section header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Personal info</h3>
            <p className="text-sm text-gray-500 mt-1">Update and manage your personal details here.</p>
          </div>
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors cursor-pointer shadow-sm"
            >
              <Pencil className="size-4" />
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="h-10 px-4 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="h-10 px-4 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-[#e4e7ec]" />

        {/* Name row */}
        <AccountRow label="Name">
          <div className="flex gap-4">
            <input
              className={editing ? ACTIVE_INPUT : DISABLED_INPUT}
              value={form.firstName}
              onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
              placeholder="First name"
              disabled={!editing}
            />
            <input
              className={editing ? ACTIVE_INPUT : DISABLED_INPUT}
              value={form.lastName}
              onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
              placeholder="Last name"
              disabled={!editing}
            />
          </div>
        </AccountRow>

        {/* Email row */}
        <AccountRow label="Email address">
          <div className={ICON_INPUT_WRAP}>
            <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <input
              className={editing ? ICON_INPUT_ACTIVE : ICON_INPUT_DISABLED}
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="you@example.com"
              disabled={!editing}
            />
          </div>
        </AccountRow>

        {/* Role row */}
        <AccountRow label="Role">
          <input
            className={editing ? ACTIVE_INPUT : DISABLED_INPUT}
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            placeholder="e.g. Operations Manager"
            disabled={!editing}
          />
        </AccountRow>
      </div>

      {/* Access type section */}
      <div>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Access Type</h3>
            <p className="text-sm text-gray-500 mt-1">You have Owner access to this organisation.</p>
          </div>
          {/* Disabled owner button */}
          <button
            type="button"
            disabled
            className="h-10 px-4 rounded-lg border border-[#e4e7ec] bg-white text-sm font-semibold text-[#98a2b3] cursor-not-allowed"
          >
            {profile?.accessType ?? 'Owner'}
          </button>
        </div>
        <div className="h-px bg-[#e4e7ec]" />
        <AccountRow label="Access type">
          {profile && <RoleBadge role={profile.accessType} />}
        </AccountRow>
      </div>

    </div>
  )
}

// ── INVITE TEAM MEMBER DRAWER ─────────────────────────────────────────────────

interface TeamMemberForm {
  name: string
  phoneNumber: string
  email: string
  address: string
  notes: string
  role: TeamRole
}

const EMPTY_MEMBER_FORM: TeamMemberForm = {
  name: '', phoneNumber: '', email: '', address: '', notes: '', role: 'Staff',
}

function InviteTeamMemberDrawer({
  open,
  mode,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean
  mode: DrawerMode
  initial?: TeamMember | null
  onClose: () => void
  onSaved: (member: TeamMember) => void
}) {
  const { showToast } = useToast()
  const [form, setForm] = useState<TeamMemberForm>(EMPTY_MEMBER_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && initial) {
        setForm({
          name:        initial.name,
          phoneNumber: initial.phoneNumber,
          email:       initial.email ?? '',
          address:     initial.address ?? '',
          notes:       initial.notes ?? '',
          role:        initial.role,
        })
      } else {
        setForm(EMPTY_MEMBER_FORM)
      }
    }
  }, [open, mode, initial])

  function f(key: keyof TeamMemberForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }))
  }

  async function handleSubmit() {
    if (!form.name.trim()) { showToast('Name is required'); return }
    if (!form.phoneNumber.trim()) { showToast('Phone number is required'); return }

    setSaving(true)
    const payload = {
      name:         form.name.trim(),
      phone_number: form.phoneNumber.trim(),
      email:        form.email.trim() || null,
      address:      form.address.trim() || null,
      notes:        form.notes.trim() || null,
      role:         form.role,
    }

    if (mode === 'add') {
      const { data, error } = await supabase.from('team_members').insert(payload).select().single()
      setSaving(false)
      if (error || !data) { showToast('Error adding team member'); return }
      onSaved({ id: data.id, name: data.name, phoneNumber: data.phone_number, email: data.email, address: data.address, notes: data.notes, role: data.role as TeamRole })
      showToast('Team member added')
    } else if (initial) {
      const { error } = await supabase.from('team_members').update(payload).eq('id', initial.id)
      setSaving(false)
      if (error) { showToast('Error updating team member'); return }
      onSaved({ ...initial, ...{ name: payload.name, phoneNumber: payload.phone_number, email: payload.email, address: payload.address, notes: payload.notes, role: form.role } })
      showToast('Team member updated')
    }

    onClose()
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={mode === 'add' ? 'Invite team member' : 'Edit team member'}
      description={mode === 'add' ? 'Add a new member to your team.' : 'Update member details.'}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 h-10 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? 'Saving…' : mode === 'add' ? 'Invite member' : 'Save changes'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Name" required>
          <input className={INPUT_CLS} placeholder="Full name" value={form.name} onChange={f('name')} />
        </FormField>
        <FormField label="Phone number" required>
          <input className={INPUT_CLS} placeholder="+91 00000 00000" value={form.phoneNumber} onChange={f('phoneNumber')} />
        </FormField>
        <FormField label="Email">
          <input className={INPUT_CLS} type="email" placeholder="member@example.com" value={form.email} onChange={f('email')} />
        </FormField>
        <FormField label="Address">
          <textarea className={TEXTAREA_CLS} rows={3} placeholder="Address" value={form.address} onChange={f('address')} />
        </FormField>
        <FormField label="Notes">
          <textarea className={TEXTAREA_CLS} rows={3} placeholder="Any notes about this member…" value={form.notes} onChange={f('notes')} />
        </FormField>
        <FormField label="Invite as">
          <div className="relative">
            <select
              className={clsx(INPUT_CLS, 'appearance-none pr-8 cursor-pointer')}
              value={form.role}
              onChange={f('role')}
            >
              {(['Owner', 'Admin', 'Manager', 'Staff'] as TeamRole[]).map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
          </div>
        </FormField>
      </div>
    </Drawer>
  )
}

// ── TEAM MEMBERS TAB ──────────────────────────────────────────────────────────

function TeamMembersTab() {
  const { showToast } = useToast()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('add')
  const [editTarget, setEditTarget] = useState<TeamMember | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null)

  useEffect(() => {
    supabase
      .from('team_members')
      .select('*')
      .order('created_at')
      .then(({ data }) => {
        if (data) {
          setMembers(data.map(r => ({
            id:          r.id,
            name:        r.name,
            phoneNumber: r.phone_number,
            email:       r.email,
            address:     r.address,
            notes:       r.notes,
            role:        r.role as TeamRole,
          })))
        }
        setLoading(false)
      })
  }, [])

  const filtered = search.trim()
    ? members.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        (m.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
        m.phoneNumber.toLowerCase().includes(search.toLowerCase())
      )
    : members

  function openAdd() { setDrawerMode('add'); setEditTarget(null); setDrawerOpen(true) }
  function openEdit(m: TeamMember) { setDrawerMode('edit'); setEditTarget(m); setDrawerOpen(true) }

  function handleSaved(member: TeamMember) {
    if (drawerMode === 'add') {
      setMembers(prev => [...prev, member])
    } else {
      setMembers(prev => prev.map(m => m.id === member.id ? member : m))
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const { error } = await supabase.from('team_members').delete().eq('id', deleteTarget.id)
    if (error) { showToast('Error deleting member'); return }
    setMembers(prev => prev.filter(m => m.id !== deleteTarget.id))
    showToast('Team member removed')
    setDeleteTarget(null)
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Team members</h2>
            <p className="text-sm text-gray-500 mt-0.5">Manage who has access to this organisation.</p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors cursor-pointer"
          >
            <Plus className="size-4" />
            Add team member
          </button>
        </div>

        {/* Search */}
        <div className="relative w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search members…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-600 focus:border-violet-600 bg-white"
          />
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Email address</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Phone number</th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-400">
                    {search ? `No members match "${search}".` : 'No team members yet. Click "Add team member" to get started.'}
                  </td>
                </tr>
              ) : filtered.map((m, i) => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name} index={i} />
                      <span className="text-sm font-medium text-gray-900">{m.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5"><RoleBadge role={m.role} /></td>
                  <td className="px-6 py-3.5 text-sm text-gray-600">{m.email || <span className="text-gray-400">—</span>}</td>
                  <td className="px-6 py-3.5 text-sm text-gray-600">{m.phoneNumber}</td>
                  <td className="px-4 py-3.5 text-right">
                    <ActionsMenu onEdit={() => openEdit(m)} onDelete={() => setDeleteTarget(m)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <InviteTeamMemberDrawer
        open={drawerOpen}
        mode={drawerMode}
        initial={editTarget}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleSaved}
      />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title="Delete team member"
        description={`Remove ${deleteTarget?.name} from your team? This action cannot be undone.`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  )
}

// ── ADD COMPANY DRAWER ────────────────────────────────────────────────────────

interface CompanyForm {
  name: string
  phoneNumber: string
  email: string
  address: string
  businessType: string
  gstinNumber: string
  serviceTaxNumber: string
  cinNumber: string
  cstTinNumber: string
  dutySlipTerms: string
  signatureUrl: string | null
  notes: string
}

const EMPTY_COMPANY_FORM: CompanyForm = {
  name: '', phoneNumber: '', email: '', address: '',
  businessType: '', gstinNumber: '', serviceTaxNumber: '', cinNumber: '', cstTinNumber: '',
  dutySlipTerms: '', signatureUrl: null, notes: '',
}

function AddCompanyDrawer({
  open,
  mode,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean
  mode: DrawerMode
  initial?: Company | null
  onClose: () => void
  onSaved: (company: Company) => void
}) {
  const { showToast } = useToast()
  const [form, setForm] = useState<CompanyForm>(EMPTY_COMPANY_FORM)
  const [saving, setSaving] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && initial) {
        setForm({
          name:             initial.name,
          phoneNumber:      initial.phoneNumber,
          email:            initial.email ?? '',
          address:          initial.address ?? '',
          businessType:     initial.businessType ?? '',
          gstinNumber:      initial.gstinNumber ?? '',
          serviceTaxNumber: initial.serviceTaxNumber ?? '',
          cinNumber:        initial.cinNumber ?? '',
          cstTinNumber:     initial.cstTinNumber ?? '',
          dutySlipTerms:    initial.dutySlipTerms ?? '',
          signatureUrl:     initial.signatureUrl ?? null,
          notes:            initial.notes ?? '',
        })
        setDetailsOpen(false)
      } else {
        setForm(EMPTY_COMPANY_FORM)
        setDetailsOpen(false)
      }
    }
  }, [open, mode, initial])

  function f(key: keyof CompanyForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }))
  }

  async function handleSubmit() {
    if (!form.name.trim()) { showToast('Company name is required'); return }
    if (!form.phoneNumber.trim()) { showToast('Phone number is required'); return }

    setSaving(true)
    const payload = {
      name:               form.name.trim(),
      phone_number:       form.phoneNumber.trim(),
      email:              form.email.trim() || null,
      address:            form.address.trim() || null,
      business_type:      form.businessType.trim() || null,
      gstin_number:       form.gstinNumber.trim() || null,
      service_tax_number: form.serviceTaxNumber.trim() || null,
      cin_number:         form.cinNumber.trim() || null,
      cst_tin_number:     form.cstTinNumber.trim() || null,
      duty_slip_terms:    form.dutySlipTerms.trim() || null,
      signature_url:      form.signatureUrl || null,
      notes:              form.notes.trim() || null,
    }

    if (mode === 'add') {
      const { data, error } = await supabase.from('companies').insert(payload).select().single()
      setSaving(false)
      if (error || !data) { showToast('Error adding company'); return }
      onSaved({
        id: data.id, name: data.name, phoneNumber: data.phone_number, email: data.email,
        address: data.address, businessType: data.business_type, gstinNumber: data.gstin_number,
        serviceTaxNumber: data.service_tax_number, cinNumber: data.cin_number,
        cstTinNumber: data.cst_tin_number, dutySlipTerms: data.duty_slip_terms,
        signatureUrl: data.signature_url, notes: data.notes,
      })
      showToast('Company added')
    } else if (initial) {
      const { error } = await supabase.from('companies').update(payload).eq('id', initial.id)
      setSaving(false)
      if (error) { showToast('Error updating company'); return }
      onSaved({
        ...initial,
        name: payload.name, phoneNumber: payload.phone_number, email: payload.email,
        address: payload.address, businessType: payload.business_type, gstinNumber: payload.gstin_number,
        serviceTaxNumber: payload.service_tax_number, cinNumber: payload.cin_number,
        cstTinNumber: payload.cst_tin_number, dutySlipTerms: payload.duty_slip_terms,
        signatureUrl: payload.signature_url, notes: payload.notes,
      })
      showToast('Company updated')
    }

    onClose()
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={mode === 'add' ? 'Add company' : 'Edit company'}
      description={mode === 'add' ? 'Add a new company to your organisation.' : 'Update company details.'}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 h-10 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? 'Saving…' : mode === 'add' ? 'Add company' : 'Save changes'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Company name" required>
          <input className={INPUT_CLS} placeholder="Company name" value={form.name} onChange={f('name')} />
        </FormField>
        <FormField label="Phone number" required>
          <input className={INPUT_CLS} placeholder="+91 00000 00000" value={form.phoneNumber} onChange={f('phoneNumber')} />
        </FormField>
        <FormField label="Email">
          <input className={INPUT_CLS} type="email" placeholder="company@example.com" value={form.email} onChange={f('email')} />
        </FormField>
        <FormField label="Address">
          <textarea className={TEXTAREA_CLS} rows={3} placeholder="Full address" value={form.address} onChange={f('address')} />
        </FormField>

        {/* Details accordion */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setDetailsOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <span className="text-sm font-semibold text-gray-700">Details</span>
            {detailsOpen
              ? <ChevronDown className="size-4 text-gray-500" />
              : <ChevronRight className="size-4 text-gray-500" />
            }
          </button>
          {detailsOpen && (
            <div className="px-4 py-4 flex flex-col gap-4 border-t border-gray-200">
              <FormField label="Business type">
                <input className={INPUT_CLS} placeholder="e.g. Private Limited" value={form.businessType} onChange={f('businessType')} />
              </FormField>
              <FormField label="GSTIN number">
                <input className={INPUT_CLS} placeholder="GST identification number" value={form.gstinNumber} onChange={f('gstinNumber')} />
              </FormField>
              <FormField label="Service tax number">
                <input className={INPUT_CLS} placeholder="Service tax number" value={form.serviceTaxNumber} onChange={f('serviceTaxNumber')} />
              </FormField>
              <FormField label="CIN number">
                <input className={INPUT_CLS} placeholder="Company identification number" value={form.cinNumber} onChange={f('cinNumber')} />
              </FormField>
              <FormField label="CST / TIN number">
                <input className={INPUT_CLS} placeholder="CST or TIN number" value={form.cstTinNumber} onChange={f('cstTinNumber')} />
              </FormField>
            </div>
          )}
        </div>

        <FormField label="Duty slip terms">
          <textarea className={TEXTAREA_CLS} rows={3} placeholder="Terms to print on duty slips…" value={form.dutySlipTerms} onChange={f('dutySlipTerms')} />
        </FormField>

        <FormField label="Signature">
          <FileUpload
            label="Attach signature"
            storagePath="signatures"
            existingUrl={form.signatureUrl}
            onChange={url => setForm(prev => ({ ...prev, signatureUrl: url }))}
          />
        </FormField>

        <FormField label="Notes">
          <textarea className={TEXTAREA_CLS} rows={3} placeholder="Any additional notes…" value={form.notes} onChange={f('notes')} />
        </FormField>
      </div>
    </Drawer>
  )
}

// ── COMPANIES TAB ─────────────────────────────────────────────────────────────

function CompaniesTab() {
  const { showToast } = useToast()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('add')
  const [editTarget, setEditTarget] = useState<Company | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null)

  useEffect(() => {
    supabase
      .from('companies')
      .select('*')
      .order('created_at')
      .then(({ data }) => {
        if (data) {
          setCompanies(data.map(r => ({
            id:               r.id,
            name:             r.name,
            phoneNumber:      r.phone_number,
            email:            r.email,
            address:          r.address,
            businessType:     r.business_type,
            gstinNumber:      r.gstin_number,
            serviceTaxNumber: r.service_tax_number,
            cinNumber:        r.cin_number,
            cstTinNumber:     r.cst_tin_number,
            dutySlipTerms:    r.duty_slip_terms,
            signatureUrl:     r.signature_url,
            notes:            r.notes,
          })))
        }
        setLoading(false)
      })
  }, [])

  const filtered = search.trim()
    ? companies.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
        c.phoneNumber.toLowerCase().includes(search.toLowerCase())
      )
    : companies

  function openAdd() { setDrawerMode('add'); setEditTarget(null); setDrawerOpen(true) }
  function openEdit(c: Company) { setDrawerMode('edit'); setEditTarget(c); setDrawerOpen(true) }

  function handleSaved(company: Company) {
    if (drawerMode === 'add') {
      setCompanies(prev => [...prev, company])
    } else {
      setCompanies(prev => prev.map(c => c.id === company.id ? company : c))
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const { error } = await supabase.from('companies').delete().eq('id', deleteTarget.id)
    if (error) { showToast('Error deleting company'); return }
    setCompanies(prev => prev.filter(c => c.id !== deleteTarget.id))
    showToast('Company removed')
    setDeleteTarget(null)
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Companies</h2>
            <p className="text-sm text-gray-500 mt-0.5">Manage companies associated with your organisation.</p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors cursor-pointer"
          >
            <Plus className="size-4" />
            Add company
          </button>
        </div>

        {/* Search */}
        <div className="relative w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search companies…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-600 focus:border-violet-600 bg-white"
          />
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Company name</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Phone number</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Email address</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Business type</th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-400">
                    {search ? `No companies match "${search}".` : 'No companies yet. Click "Add company" to get started.'}
                  </td>
                </tr>
              ) : filtered.map((c, i) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} index={i} />
                      <span className="text-sm font-medium text-gray-900">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-sm text-gray-600">{c.phoneNumber}</td>
                  <td className="px-6 py-3.5 text-sm text-gray-600">{c.email || <span className="text-gray-400">—</span>}</td>
                  <td className="px-6 py-3.5 text-sm text-gray-600">{c.businessType || <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3.5 text-right">
                    <ActionsMenu onEdit={() => openEdit(c)} onDelete={() => setDeleteTarget(c)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddCompanyDrawer
        open={drawerOpen}
        mode={drawerMode}
        initial={editTarget}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleSaved}
      />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title="Delete company"
        description={`Remove ${deleteTarget?.name}? This action cannot be undone.`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  )
}

// ── SETTINGS PAGE ─────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: 'account',   label: 'Account' },
  { id: 'team',      label: 'Team members' },
  { id: 'companies', label: 'Companies' },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('account')

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="shrink-0 px-10 pt-8">
        <h1 className="text-[30px] font-semibold leading-[38px] text-gray-900">Settings</h1>
        <p className="mt-1 text-base font-normal text-gray-500">Manage your account and organisation settings.</p>
      </div>

      {/* Tabs */}
      <div className="shrink-0 px-10 pt-5">
        <div className="flex items-center gap-1">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={clsx(
                'px-3 py-2 rounded-md text-base font-semibold whitespace-nowrap transition-colors duration-150 cursor-pointer',
                activeTab === t.id
                  ? 'bg-violet-50 text-violet-700'
                  : 'bg-white text-gray-700 hover:bg-gray-50',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-5 h-px bg-gray-200" />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-10 py-8">
        {activeTab === 'account'   && <AccountTab />}
        {activeTab === 'team'      && <TeamMembersTab />}
        {activeTab === 'companies' && <CompaniesTab />}
      </div>
    </div>
  )
}
