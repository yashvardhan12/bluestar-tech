import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, MoreHorizontal, Pencil, Trash2, ChevronDown, ChevronRight, Mail, Check, LogOut } from 'lucide-react'
import { clsx } from 'clsx'
import Drawer from '../../components/ui/Drawer'
import FileUpload from '../../components/ui/FileUpload'
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useMenuFlip } from '../../lib/useMenuFlip'
import { useToast } from '../../components/ui/Toast'
import type { CompanyOption } from '../../components/CompanySwitcher'

// ── types ──────────────────────────────────────────────────────────────────────

type Tab = 'account' | 'team' | 'companies'
// Two roles only. Manager and Staff were cut — an unused enum value that no
// policy branches on is a silent hole waiting for someone to set it.
type TeamRole = 'Owner' | 'Admin'
type DrawerMode = 'add' | 'edit'

interface TeamMember {
  id: string
  firstName: string
  lastName: string
  email: string
  jobTitle: string
  phoneNumber: string | null
  role: TeamRole
  companyIds: number[]
}

interface Company {
  id: number
  name: string
  shortCode: string
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
  Owner: 'bg-violet-50 border border-violet-200 text-violet-700',
  Admin: 'bg-gray-50 border border-gray-200 text-gray-700',
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

// onDelete is optional: companies cannot be deleted (EXPERIENCE.md Rule 4), and
// this menu is shared with the Team members tab, which can.
function ActionsMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete?: () => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation()
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.right - 144 })
    setOpen(o => !o)
  }

  useMenuFlip(open, btnRef, menuRef, top => setPos(p => ({ ...p, top })))

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[9999] w-36 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden py-1"
        >
          <button
            type="button"
            onClick={() => { setOpen(false); onEdit() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <Pencil className="size-3.5" />
            Edit
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => { setOpen(false); onDelete() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error-600 hover:bg-error-50 transition-colors cursor-pointer"
            >
              <Trash2 className="size-3.5" />
              Delete
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="text-error-500 ml-0.5">*</span>}
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
      <div className="h-px bg-gray-200" />
    </>
  )
}

function AccountTab() {
  const { showToast } = useToast()
  const { profile, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', jobTitle: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile) {
      setForm({
        firstName: profile.firstName,
        lastName:  profile.lastName,
        email:     profile.email,
        jobTitle:  profile.jobTitle,
      })
    }
  }, [profile])

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: form.firstName,
        last_name:  form.lastName,
        email:      form.email,
        job_title:  form.jobTitle,
      })
      .eq('id', profile.id)
    setSaving(false)
    if (error) { showToast(`Couldn’t save: ${error.message}`); return }
    await refreshProfile()
    setEditing(false)
    showToast('Profile updated')
  }

  function handleCancel() {
    if (profile) {
      setForm({
        firstName: profile.firstName, lastName: profile.lastName,
        email: profile.email, jobTitle: profile.jobTitle,
      })
    }
    setEditing(false)
  }

  if (!profile) {
    return (
      <div className="w-full max-w-3xl flex flex-col gap-3">
        {[...Array(3)].map((_, i) => <span key={i} aria-hidden className="block h-10 rounded-lg bg-gray-100" />)}
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl flex flex-col gap-6">

      <div>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Personal info</h3>
            <p className="text-sm text-gray-500 mt-1">Update and manage your personal details here.</p>
          </div>
          {!editing ? (
            <button type="button" onClick={() => setEditing(true)}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors cursor-pointer shadow-sm">
              <Pencil className="size-4" />
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleCancel}
                className="h-10 px-4 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="h-10 px-4 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}
        </div>

        <div className="h-px bg-gray-200" />

        <AccountRow label="Name">
          <div className="flex gap-4">
            <input className={editing ? ACTIVE_INPUT : DISABLED_INPUT} value={form.firstName}
              onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
              placeholder="First name" disabled={!editing} />
            <input className={editing ? ACTIVE_INPUT : DISABLED_INPUT} value={form.lastName}
              onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
              placeholder="Last name" disabled={!editing} />
          </div>
        </AccountRow>

        <AccountRow label="Email address">
          <div className={ICON_INPUT_WRAP}>
            <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <input className={editing ? ICON_INPUT_ACTIVE : ICON_INPUT_DISABLED} type="email"
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="you@example.com" disabled={!editing} />
          </div>
        </AccountRow>

        <AccountRow label="Job title">
          <input className={editing ? ACTIVE_INPUT : DISABLED_INPUT} value={form.jobTitle}
            onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
            placeholder="e.g. Operations Manager" disabled={!editing} />
        </AccountRow>
      </div>

      <div>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Access</h3>
            <p className="text-sm text-gray-500 mt-1">
              You have {profile.role} access to this organisation.
            </p>
          </div>
        </div>
        <div className="h-px bg-gray-200" />
        <AccountRow label="Role">
          <div className="flex items-center gap-3">
            <RoleBadge role={profile.role} />
            <span className="text-sm text-gray-500">
              {profile.role === 'Owner'
                ? 'Owners create companies and manage roles.'
                : 'Only an Owner can change your role.'}
            </span>
          </div>
        </AccountRow>
      </div>

      <div>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Session</h3>
            <p className="text-sm text-gray-500 mt-1">Signed in as {profile.email}.</p>
          </div>
          <button
            type="button"
            onClick={() => { void signOut().then(() => navigate('/login', { replace: true })) }}
            className="flex items-center gap-2 h-10 px-4 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <LogOut className="size-4" strokeWidth={1.75} />
            Sign out
          </button>
        </div>
        <div className="h-px bg-gray-200" />
      </div>

    </div>
  )
}

// ── MEMBER DRAWER ─────────────────────────────────────────────────────────────

interface MemberForm {
  firstName: string
  lastName: string
  email: string
  jobTitle: string
  phoneNumber: string
  role: TeamRole
  companyIds: number[]
}

function MemberDrawer({
  open,
  member,
  companies,
  isSelf,
  viewerIsOwner,
  onClose,
  onSaved,
}: {
  open: boolean
  member: TeamMember | null
  companies: CompanyOption[]
  isSelf: boolean
  viewerIsOwner: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [form, setForm] = useState<MemberForm>({
    firstName: '', lastName: '', email: '', jobTitle: '', phoneNumber: '', role: 'Admin', companyIds: [],
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && member) {
      setForm({
        firstName:   member.firstName,
        lastName:    member.lastName,
        email:       member.email,
        jobTitle:    member.jobTitle,
        phoneNumber: member.phoneNumber ?? '',
        role:        member.role,
        companyIds:  [...member.companyIds],
      })
    }
  }, [open, member])

  // Member rule 3 — the checklist is read-only on your own row, for every role
  // including Owner. Nobody grants themselves access; creating a company
  // auto-joins you and that is the only exception.
  const accessLocked = isSelf

  function toggleCompany(id: number) {
    if (accessLocked) return
    setForm(prev => ({
      ...prev,
      companyIds: prev.companyIds.includes(id)
        ? prev.companyIds.filter(c => c !== id)
        : [...prev.companyIds, id],
    }))
  }

  async function handleSubmit() {
    if (!member) return
    if (!form.firstName.trim()) { showToast('First name is required'); return }

    // Member rule 6 — at least one company must remain, validated against the
    // member's TOTAL memberships, not just the ones this editor can see.
    const visibleIds = companies.map(c => c.id)
    const hiddenKept = member.companyIds.filter(id => !visibleIds.includes(id))
    if (!accessLocked && form.companyIds.length + hiddenKept.length === 0) {
      showToast('A member must belong to at least one company')
      return
    }

    setSaving(true)

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({
        first_name:   form.firstName.trim(),
        last_name:    form.lastName.trim(),
        email:        form.email.trim(),
        job_title:    form.jobTitle.trim(),
        phone_number: form.phoneNumber.trim() || null,
      })
      .eq('id', member.id)

    if (profileErr) { setSaving(false); showToast(`Error saving: ${profileErr.message}`); return }

    // Member rule 5 — role changes are Owner-only and go through an RPC, never
    // a direct column write (UPDATE on profiles.role is revoked).
    if (viewerIsOwner && !isSelf && form.role !== member.role) {
      const { error } = await supabase.rpc('set_member_role', { target: member.id, new_role: form.role })
      if (error) { setSaving(false); showToast(`Error changing role: ${error.message}`); return }
    }

    // Member rule 4 — apply a DELTA within the editor's visible set only, so a
    // membership this editor cannot see is never silently revoked.
    if (!accessLocked) {
      const before = new Set(member.companyIds.filter(id => visibleIds.includes(id)))
      const after  = new Set(form.companyIds.filter(id => visibleIds.includes(id)))
      const toAdd    = [...after].filter(id => !before.has(id))
      const toRemove = [...before].filter(id => !after.has(id))

      if (toAdd.length) {
        const { error } = await supabase.from('company_members')
          .insert(toAdd.map(company_id => ({ company_id, profile_id: member.id })))
        if (error) { setSaving(false); showToast(`Error granting access: ${error.message}`); return }
      }
      for (const company_id of toRemove) {
        const { error } = await supabase.from('company_members')
          .delete().eq('company_id', company_id).eq('profile_id', member.id)
        if (error) { setSaving(false); showToast(`Error removing access: ${error.message}`); return }
      }
    }

    setSaving(false)
    showToast('Member updated')
    onSaved()
    onClose()
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Edit team member"
      description="Update member details and company access."
      footer={
        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving}
            className="flex-1 h-10 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="First name" required>
            <input className={INPUT_CLS} value={form.firstName}
              onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} />
          </FormField>
          <FormField label="Last name">
            <input className={INPUT_CLS} value={form.lastName}
              onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} />
          </FormField>
        </div>

        <FormField label="Email">
          <input className={INPUT_CLS} type="email" value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
        </FormField>

        <FormField label="Job title">
          <input className={INPUT_CLS} placeholder="e.g. Operations Manager" value={form.jobTitle}
            onChange={e => setForm(p => ({ ...p, jobTitle: e.target.value }))} />
        </FormField>

        <FormField label="Phone number">
          <input className={INPUT_CLS} placeholder="+91 00000 00000" value={form.phoneNumber}
            onChange={e => setForm(p => ({ ...p, phoneNumber: e.target.value }))} />
        </FormField>

        <FormField label="Role">
          {viewerIsOwner && !isSelf ? (
            <div className="relative">
              <select
                className={clsx(INPUT_CLS, 'appearance-none pr-8 cursor-pointer')}
                value={form.role}
                onChange={e => setForm(p => ({ ...p, role: e.target.value as TeamRole }))}
              >
                {(['Owner', 'Admin'] as TeamRole[]).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            </div>
          ) : (
            <>
              <div className={clsx(INPUT_CLS, 'flex items-center bg-gray-50 text-gray-500')}>{form.role}</div>
              <p className="text-xs text-gray-500">
                {isSelf ? 'You cannot change your own role.' : 'Only an Owner can change roles.'}
              </p>
            </>
          )}
        </FormField>

        <div className="pt-1 border-t border-gray-200">
          <p className="text-sm font-semibold text-gray-700 mt-4 mb-1">Company access</p>
          <p className="text-xs text-gray-500 mb-3">
            {accessLocked
              ? 'Read-only — you can’t change your own company access.'
              : 'They can see and work in the companies ticked here.'}
          </p>

          <div className="flex flex-col gap-1.5">
            {companies.map(c => {
              const on = form.companyIds.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCompany(c.id)}
                  disabled={accessLocked}
                  className={clsx(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors',
                    accessLocked ? 'border-gray-200 cursor-not-allowed' : 'border-gray-200 hover:bg-gray-50 cursor-pointer',
                  )}
                >
                  <span className={clsx(
                    'size-4 rounded flex items-center justify-center border shrink-0',
                    on && !accessLocked ? 'bg-violet-600 border-violet-600'
                      : on ? 'bg-gray-100 border-gray-200' : 'bg-white border-gray-300',
                  )}>
                    {on && <Check className={clsx('size-3', accessLocked ? 'text-gray-400' : 'text-white')} strokeWidth={3} />}
                  </span>
                  <span className="size-6 rounded-md bg-gray-100 text-gray-600 text-[10px] font-bold flex items-center justify-center">
                    {c.short_code}
                  </span>
                  <span className={clsx('text-sm', accessLocked ? 'text-gray-500' : 'text-gray-900')}>{c.name}</span>
                </button>
              )
            })}
          </div>

          {accessLocked && (
            <p className="mt-3 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600 leading-relaxed">
              Nobody grants themselves access. Creating a company adds you to it automatically — that’s the only exception.
            </p>
          )}
        </div>
      </div>
    </Drawer>
  )
}

// ── TEAM MEMBERS TAB ──────────────────────────────────────────────────────────

function TeamMembersTab() {
  const { showToast } = useToast()
  const { profile: me } = useAuth()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [editTarget, setEditTarget] = useState<TeamMember | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    const [{ data: profs, error: pErr }, { data: comps, error: cErr }, { data: mems, error: mErr }] =
      await Promise.all([
        supabase.from('profiles').select('id, first_name, last_name, email, job_title, role, phone_number'),
        supabase.rpc('my_companies'),
        supabase.from('company_members').select('company_id, profile_id'),
      ])

    if (pErr || cErr || mErr) {
      setError((pErr ?? cErr ?? mErr)!.message)
      setLoading(false)
      return
    }

    setCompanies(comps ?? [])
    setMembers((profs ?? []).map((p: Record<string, string>) => ({
      id:          p.id,
      firstName:   p.first_name,
      lastName:    p.last_name,
      email:       p.email,
      jobTitle:    p.job_title,
      phoneNumber: p.phone_number,
      role:        p.role as TeamRole,
      companyIds:  (mems ?? []).filter((m: { profile_id: string }) => m.profile_id === p.id)
                               .map((m: { company_id: number }) => m.company_id),
    })))
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = search.trim()
    ? members.filter(m => {
        const q = search.toLowerCase()
        return `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)
          || m.email.toLowerCase().includes(q)
          || (m.phoneNumber ?? '').toLowerCase().includes(q)
      })
    : members

  async function handleDelete() {
    if (!deleteTarget) return
    const { error: delErr } = await supabase.from('profiles').delete().eq('id', deleteTarget.id)
    if (delErr) { showToast(`Couldn’t remove member: ${delErr.message}`); return }
    showToast('Team member removed')
    setDeleteTarget(null)
    void load()
  }

  const nameOf = (m: TeamMember) => `${m.firstName} ${m.lastName}`.trim() || m.email

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Team members</h2>
            <p className="text-sm text-gray-500 mt-0.5">Manage who has access to which company.</p>
          </div>
          <button
            type="button"
            disabled
            title="Invites need the email edge function — Phase 4"
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-gray-100 text-sm font-semibold text-gray-400 cursor-not-allowed"
          >
            <Plus className="size-4" />
            Invite member
          </button>
        </div>

        <div className="relative w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
          <input
            type="text" placeholder="Search members…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-600 focus:border-violet-600 bg-white"
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Companies</th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} aria-hidden>
                    <td className="px-6 py-3.5"><span className="block h-3 w-32 rounded-lg bg-gray-100" /></td>
                    <td className="px-6 py-3.5"><span className="block h-3 w-16 rounded-lg bg-gray-100" /></td>
                    <td className="px-6 py-3.5"><span className="block h-3 w-40 rounded-lg bg-gray-100" /></td>
                    <td className="px-6 py-3.5"><span className="block h-3 w-24 rounded-lg bg-gray-100" /></td>
                    <td />
                  </tr>
                ))
              ) : error ? (
                <tr><td colSpan={5} className="px-6 py-12">
                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-900">Couldn’t load team members.</p>
                    <p className="text-sm text-gray-500 mt-1">Something went wrong on our end. Your data is safe.</p>
                    <button onClick={() => void load()}
                      className="mt-4 h-9 px-4 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer">
                      Try again
                    </button>
                    <details className="mt-4 mx-auto max-w-md text-left rounded-lg border border-gray-200 overflow-hidden">
                      <summary className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-600 cursor-pointer">Technical details</summary>
                      <pre className="px-3 py-2 text-[11px] font-mono text-gray-600 whitespace-pre-wrap border-t border-gray-200">{error}</pre>
                    </details>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-400">
                  {search ? `No members match “${search}”.` : 'No team members yet.'}
                </td></tr>
              ) : filtered.map((m, i) => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={nameOf(m)} index={i} />
                      <div>
                        <span className="text-sm font-medium text-gray-900">{nameOf(m)}</span>
                        {m.id === me?.id && <span className="ml-2 text-xs text-gray-400">you</span>}
                        {m.jobTitle && <p className="text-xs text-gray-500">{m.jobTitle}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3.5"><RoleBadge role={m.role} /></td>
                  <td className="px-6 py-3.5 text-sm text-gray-600">{m.email || <span className="text-gray-400">—</span>}</td>
                  <td className="px-6 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {m.companyIds.length === 0
                        ? <span className="text-gray-400 text-sm">—</span>
                        : companies.filter(c => m.companyIds.includes(c.id)).map(c => (
                            <span key={c.id} className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-bold text-gray-600">
                              {c.short_code}
                            </span>
                          ))}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <ActionsMenu
                      onEdit={() => setEditTarget(m)}
                      onDelete={m.id === me?.id ? undefined : () => setDeleteTarget(m)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <MemberDrawer
        open={!!editTarget}
        member={editTarget}
        companies={companies}
        isSelf={editTarget?.id === me?.id}
        viewerIsOwner={me?.role === 'Owner'}
        onClose={() => setEditTarget(null)}
        onSaved={() => void load()}
      />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title="Remove team member"
        description={`Remove ${deleteTarget ? nameOf(deleteTarget) : ''}? They will lose access to every company.`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  )
}

// ── ADD COMPANY DRAWER ────────────────────────────────────────────────────────

interface CompanyForm {
  name: string
  shortCode: string
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
  name: '', shortCode: '', phoneNumber: '', email: '', address: '',
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
          shortCode:        initial.shortCode,
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

  // Suggest a short code from the distinguishing words: "Bluestar North" -> BN.
  // Only a suggestion — the field stays editable (EXPERIENCE.md Rule 5).
  function suggestCode(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return ''
    const initials = words.map(w => w[0]).join('').toUpperCase()
    return (initials.length >= 2 ? initials : words[0].toUpperCase()).slice(0, 3).replace(/[^A-Z0-9]/g, '')
  }

  async function handleSubmit() {
    if (!form.name.trim()) { showToast('Company name is required'); return }
    if (!form.phoneNumber.trim()) { showToast('Phone number is required'); return }

    const code = (form.shortCode.trim() || suggestCode(form.name)).toUpperCase()
    if (!/^[A-Z0-9]{2,3}$/.test(code)) {
      showToast('Short code must be 2–3 letters or numbers')
      return
    }

    setSaving(true)
    const payload = {
      name:               form.name.trim(),
      short_code:         code,
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
        id: data.id, name: data.name, shortCode: data.short_code, phoneNumber: data.phone_number, email: data.email,
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
        name: payload.name, shortCode: payload.short_code, phoneNumber: payload.phone_number, email: payload.email,
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
          <input className={INPUT_CLS} placeholder="e.g. Bluestar North" value={form.name} onChange={f('name')} />
        </FormField>
        <FormField label="Short code" required>
          <input
            className={clsx(INPUT_CLS, 'uppercase tracking-wide')}
            placeholder={suggestCode(form.name) || 'BN'}
            maxLength={3}
            value={form.shortCode}
            onChange={e => setForm(prev => ({ ...prev, shortCode: e.target.value.toUpperCase() }))}
          />
          <p className="text-xs text-gray-500">
            2–3 characters, shown in the sidebar. Leave blank to use{' '}
            <span className="font-medium text-gray-700">{suggestCode(form.name) || '—'}</span>.
          </p>
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
            shortCode:        r.short_code,
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
              ) : filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="size-8 rounded-md bg-violet-50 border border-violet-100 text-violet-700 text-[11px] font-bold flex items-center justify-center shrink-0">
                        {c.shortCode}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-sm text-gray-600">{c.phoneNumber}</td>
                  <td className="px-6 py-3.5 text-sm text-gray-600">{c.email || <span className="text-gray-400">—</span>}</td>
                  <td className="px-6 py-3.5 text-sm text-gray-600">{c.businessType || <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3.5 text-right">
                    {/* No delete — companies own bookings, invoices and payroll */}
                    <ActionsMenu onEdit={() => openEdit(c)} />
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
