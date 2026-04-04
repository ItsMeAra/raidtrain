import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'

function formatHour(hour24) {
  const h = ((hour24 % 24) + 24) % 24
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:00 ${period}`
}

const SLOTS = Array.from({ length: 15 }, (_, i) => {
  const hour = 9 + i
  return {
    hour,
    start: formatHour(hour),
    end: formatHour(hour + 1),
    position: i + 1,
  }
})

const HOST_OPEN = {
  id: 'host-open',
  start: '8:50 AM',
  end: '9:00 AM',
  label: 'OPENS THE RAID TRAIN',
}

const HOST_CLOSE = {
  id: 'host-close',
  start: '12:00 AM',
  end: '12:10 AM',
  label: 'CLOSES THE RAID TRAIN',
}

const TOTAL_SLOTS = 15
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD ?? ''

function formatEventDate(isoDate) {
  if (!isoDate) return null
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function App() {
  const [eventDateRaw, setEventDateRaw] = useState(null)
  const [bookings, setBookings] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [modalHour, setModalHour] = useState(null)
  const [modalStep, setModalStep] = useState('form')
  const [showNameInput, setShowNameInput] = useState('')
  const [savingSlot, setSavingSlot] = useState(false)
  const [confirmedName, setConfirmedName] = useState('')

  const [adminOpen, setAdminOpen] = useState(false)
  const [adminAuthed, setAdminAuthed] = useState(false)
  const [adminPasswordInput, setAdminPasswordInput] = useState('')
  const [adminDateInput, setAdminDateInput] = useState('')
  const [savingDate, setSavingDate] = useState(false)

  const hasClient = Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
  )

  const refreshData = useCallback(async () => {
    const [configRes, slotsRes] = await Promise.all([
      supabase.from('raid_config').select('event_date').eq('id', 'singleton').maybeSingle(),
      supabase.from('raid_slots').select('hour, show_name'),
    ])
    if (configRes.error) throw configRes.error
    if (slotsRes.error) throw slotsRes.error
    setEventDateRaw(configRes.data?.event_date ?? null)
    const next = {}
    for (const row of slotsRes.data ?? []) {
      next[row.hour] = row.show_name
    }
    setBookings(next)
  }, [])

  useEffect(() => {
    if (!hasClient) {
      setLoadError('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.')
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        setLoadError(null)
        await refreshData()
      } catch (e) {
        if (!cancelled) {
          setLoadError(e?.message ?? 'Could not connect to Supabase.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hasClient, refreshData])

  useEffect(() => {
    if (!hasClient || loadError) return

    const channel = supabase
      .channel('raidtrain-public')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'raid_slots' },
        () => {
          void refreshData().catch(() => {})
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'raid_config' },
        () => {
          void refreshData().catch(() => {})
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [hasClient, loadError, refreshData])

  const bookedCount = useMemo(
    () => SLOTS.filter((s) => bookings[s.hour]).length,
    [bookings],
  )
  const openCount = TOTAL_SLOTS - bookedCount

  const eventDateLine = eventDateRaw
    ? formatEventDate(eventDateRaw)
    : null

  function openClaimModal(hour) {
    setModalHour(hour)
    setModalStep('form')
    setShowNameInput('')
    setConfirmedName('')
  }

  function closeModal() {
    setModalHour(null)
    setModalStep('form')
    setShowNameInput('')
    setConfirmedName('')
    setSavingSlot(false)
  }

  async function submitClaim() {
    const name = showNameInput.trim()
    if (!name || modalHour == null) return
    setSavingSlot(true)
    const { error } = await supabase.from('raid_slots').insert({
      hour: modalHour,
      show_name: name,
    })
    setSavingSlot(false)
    if (error) {
      if (error.code === '23505') {
        alert('That slot was just taken. Refreshing the schedule.')
        await refreshData().catch(() => {})
        closeModal()
        return
      }
      alert(error.message ?? 'Could not save. Try again.')
      return
    }
    setConfirmedName(name)
    setModalStep('confirm')
    await refreshData().catch(() => {})
  }

  function tryAdminLogin(e) {
    e.preventDefault()
    if (adminPasswordInput === ADMIN_PASSWORD) {
      setAdminAuthed(true)
      setAdminPasswordInput('')
      setAdminDateInput(eventDateRaw ?? '')
    } else {
      alert('Wrong password.')
    }
  }

  async function saveEventDate(e) {
    e.preventDefault()
    setSavingDate(true)
    const { error } = await supabase.from('raid_config').upsert(
      { id: 'singleton', event_date: adminDateInput || null },
      { onConflict: 'id' },
    )
    setSavingDate(false)
    if (error) {
      alert(error.message ?? 'Could not save date.')
      return
    }
    await refreshData().catch(() => {})
  }

  async function removeSlot(hour) {
    if (!window.confirm('Remove this booking from the roster?')) return
    const { error } = await supabase.from('raid_slots').delete().eq('hour', hour)
    if (error) {
      alert(error.message ?? 'Could not remove.')
      return
    }
    await refreshData().catch(() => {})
  }

  function closeAdmin() {
    setAdminOpen(false)
    setAdminAuthed(false)
    setAdminPasswordInput('')
    setAdminDateInput('')
  }

  const selectedSlotMeta =
    modalHour != null ? SLOTS.find((s) => s.hour === modalHour) : null

  if (loadError) {
    return (
      <div className="app-backdrop text-muted flex min-h-dvh items-center justify-center px-4 py-10">
        <div className="raid-card relative z-10 w-full max-w-md overflow-hidden px-6 py-10 text-center">
          <h1 className="font-display text-2xl text-white uppercase tracking-wide mb-3">
            Connection error
          </h1>
          <p className="font-mono text-base text-muted-2">{loadError}</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="app-backdrop flex min-h-dvh items-center justify-center px-4">
        <div className="raid-card relative z-10 px-10 py-12">
          <p className="font-mono text-sm text-muted-2 tracking-widest">LOADING…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-backdrop text-white pb-[max(7.5rem,env(safe-area-inset-bottom,0px))]">
      <div className="mx-auto w-full max-w-[720px] px-3 pt-6 sm:px-5 sm:pt-8 sm:pb-2">
        <div className="raid-card relative z-10 overflow-hidden">
          <header className="border-b border-border-subtle px-3 pt-8 sm:px-6 sm:pt-10 pb-6 sm:pb-8">
        <p className="font-mono text-xs tracking-[0.25em] text-muted flex items-center justify-center gap-2 mb-3 text-center">
          <span
            className="inline-block w-2 h-2 rounded-full bg-orange animate-pulse"
            aria-hidden
          />
          WHATNOT RAID TRAIN
          <span
            className="inline-block w-2 h-2 rounded-full bg-orange animate-pulse"
            aria-hidden
          />
        </p>
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold text-center uppercase tracking-tight mb-3 sm:mb-4 px-1 leading-tight">
          RAID SCHEDULE
        </h1>
        <p className="text-muted-2 font-mono text-xs sm:text-sm tracking-wider text-center mb-5 sm:mb-6 px-1 text-balance">
          {eventDateLine ?? 'DATE TBD — ADMIN SETS THE DATE'}
        </p>
        <div className="grid grid-cols-3 font-mono text-[11px] sm:text-xs tracking-widest">
          <div className="text-center py-3 sm:py-2 border-r border-border-subtle min-h-[3.25rem] sm:min-h-0 flex flex-col justify-center">
            <span className="text-muted-2 block mb-1">BOOKED</span>
            <span className="text-orange text-base tabular-nums">{bookedCount}</span>
          </div>
          <div className="text-center py-3 sm:py-2 border-r border-border-subtle min-h-[3.25rem] sm:min-h-0 flex flex-col justify-center">
            <span className="text-muted-2 block mb-1">OPEN</span>
            <span className="text-white text-base tabular-nums">{openCount}</span>
          </div>
          <div className="text-center py-3 sm:py-2 min-h-[3.25rem] sm:min-h-0 flex flex-col justify-center">
            <span className="text-muted-2 block mb-1">TOTAL</span>
            <span className="text-white text-base tabular-nums">{TOTAL_SLOTS}</span>
          </div>
        </div>
          </header>

          <main className="px-3 pb-6 pt-2 sm:px-6 sm:pb-8">
        <div className="animate-slide-up" style={{ animationDelay: '0ms' }}>
          <HostRow host={HOST_OPEN} />
        </div>
        {SLOTS.map((slot, i) => {
          const booked = bookings[slot.hour]
          const staggerIndex = i + 1
          return (
            <div
              key={slot.hour}
              className="animate-slide-up"
              style={{ animationDelay: `${staggerIndex * 30}ms` }}
            >
              {booked ? (
                <div className="border-b border-border-subtle py-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <span className="font-mono text-base text-muted-2 w-8 text-right shrink-0">
                      #{String(slot.position).padStart(2, '0')}
                    </span>
                    <span className="font-mono text-base text-muted-2 w-[6.5rem] sm:w-28 shrink-0 tabular-nums">
                      {slot.start}
                    </span>
                    <span
                      className="text-neutral-700 shrink-0 text-lg hidden sm:inline"
                      aria-hidden
                    >
                      →
                    </span>
                    <span className="bg-orange text-white font-mono text-[10px] px-2.5 py-1 tracking-widest shrink-0 sm:hidden">
                      BOOKED
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 min-w-0 sm:flex-row sm:items-center sm:flex-1 sm:gap-3">
                    <span className="font-display text-lg sm:text-xl font-semibold text-orange uppercase tracking-wide break-words sm:flex-1 sm:min-w-0 sm:truncate">
                      {booked}
                    </span>
                    <span className="bg-orange text-white font-mono text-[10px] px-2.5 py-1 tracking-widest shrink-0 self-start hidden sm:inline-block">
                      BOOKED
                    </span>
                  </div>
                </div>
              ) : (
                <div className="border-b border-border-subtle py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="font-mono text-base text-muted-2 w-8 text-right shrink-0">
                      #{String(slot.position).padStart(2, '0')}
                    </span>
                    <span className="font-mono text-base text-muted w-[6.5rem] sm:w-28 shrink-0 tabular-nums">
                      {slot.start}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openClaimModal(slot.hour)}
                    className="w-full min-h-11 sm:min-h-0 sm:w-auto sm:ml-auto shrink-0 border border-orange text-orange font-display font-semibold uppercase text-sm tracking-widest px-5 py-2.5 animate-pulse-glow hover:bg-orange hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Claim slot
                  </button>
                </div>
              )}
            </div>
          )
        })}
        <div
          className="animate-slide-up"
          style={{ animationDelay: `${16 * 30}ms` }}
        >
          <HostRow host={HOST_CLOSE} />
        </div>
          </main>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setAdminOpen(true)}
        className="fixed z-40 bg-surface border border-border text-muted font-mono text-[11px] tracking-widest px-3.5 py-2.5 min-h-11 min-w-[4.5rem] cursor-pointer hover:border-orange hover:text-orange transition-colors right-[max(1rem,env(safe-area-inset-right,0px))] bottom-[max(1rem,env(safe-area-inset-bottom,0px))] sm:right-5 sm:bottom-5"
      >
        ⚙ ADMIN
      </button>

      {modalHour != null && selectedSlotMeta && (
        <div
          className="fixed inset-0 z-50 bg-black/88 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in overflow-y-auto overscroll-contain"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="bg-surface border border-orange border-b-0 sm:border-b w-full max-w-md shadow-lg p-6 sm:p-8 rounded-t-2xl sm:rounded-none mt-auto sm:mt-0 max-h-[min(92dvh,100%)] overflow-y-auto sm:max-h-none">
            {modalStep === 'form' ? (
              <>
                <h2 id="modal-title" className="sr-only">
                  Claim raid slot
                </h2>
                <p className="font-display text-3xl sm:text-4xl font-bold text-center uppercase mb-2 break-words">
                  {selectedSlotMeta.start}
                </p>
                <p className="font-mono text-[11px] sm:text-xs text-muted-2 text-center tracking-widest mb-6 sm:mb-8 text-balance px-1">
                  #{String(selectedSlotMeta.position).padStart(2, '0')} ·{' '}
                  {selectedSlotMeta.start} – {selectedSlotMeta.end}
                </p>
                <label
                  htmlFor="show-name"
                  className="font-mono text-xs text-muted-2 tracking-widest block mb-2"
                >
                  Enter Whatnot Username:
                </label>
                <input
                  id="show-name"
                  type="text"
                  autoComplete="off"
                  placeholder="@whatnotusername"
                  value={showNameInput}
                  onChange={(e) => setShowNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && showNameInput.trim() && !savingSlot) {
                      void submitClaim()
                    }
                  }}
                  className="w-full bg-bg border border-border text-white placeholder:text-muted-2 font-display text-xl px-4 py-3.5 mb-6"
                />
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-stretch">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="w-full sm:w-auto bg-transparent border border-border text-muted font-display text-base tracking-wide px-4 py-3.5 sm:py-4 min-h-11 cursor-pointer hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!showNameInput.trim() || savingSlot}
                    onClick={() => void submitClaim()}
                    className="w-full sm:flex-1 bg-orange text-white font-display font-semibold text-base sm:text-lg uppercase tracking-widest py-3.5 sm:py-4 min-h-11 cursor-pointer transition-colors disabled:bg-surface disabled:text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {savingSlot ? 'SAVING…' : 'LOCK IT IN 🔒'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-5xl text-center mb-4" aria-hidden>
                  🔥
                </p>
                <p className="font-display text-2xl sm:text-3xl font-bold text-center uppercase mb-2 break-words px-1">
                  {selectedSlotMeta.start}
                </p>
                <p className="font-display text-xl sm:text-2xl text-center text-orange uppercase tracking-wide mb-6 break-words px-1">
                  {confirmedName}
                </p>
                <p className="text-muted font-mono text-sm text-center mb-8">
                  Screenshot this confirmation for your records.
                </p>
                <button
                  type="button"
                  onClick={closeModal}
                  className="w-full min-h-11 bg-orange text-white font-display font-semibold text-base sm:text-lg uppercase tracking-widest py-3.5 sm:py-4 cursor-pointer"
                >
                  LET&apos;S GOOO 🔥
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {adminOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-label="Admin panel"
        >
          <button
            type="button"
            className="flex-1 min-h-0 cursor-default bg-transparent border-0 w-full"
            aria-label="Close admin overlay"
            onClick={closeAdmin}
          />
          <div className="bg-surface border-t border-border rounded-t-2xl max-h-[min(90dvh,100%)] overflow-y-auto overscroll-contain animate-sheet-up shadow-2xl pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
            <div className="max-w-lg w-full mx-auto p-4 sm:p-6 pb-6 sm:pb-10">
              <div className="flex justify-between items-start gap-3 mb-5 sm:mb-6">
                <h2 className="font-display text-xl uppercase tracking-wide">
                  Admin
                </h2>
                <button
                  type="button"
                  onClick={closeAdmin}
                  className="font-mono text-sm text-muted hover:text-white"
                >
                  Close
                </button>
              </div>

              {!adminAuthed ? (
                <form onSubmit={tryAdminLogin} className="space-y-4">
                  <label
                    htmlFor="admin-pass"
                    className="font-mono text-xs text-muted-2 tracking-widest block"
                  >
                    Password
                  </label>
                  <input
                    id="admin-pass"
                    type="password"
                    autoComplete="current-password"
                    value={adminPasswordInput}
                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                    className="w-full bg-bg border border-border text-white font-display text-xl px-4 py-3.5"
                  />
                  <button
                    type="submit"
                    className="w-full bg-orange text-white font-display font-semibold text-base uppercase tracking-widest py-3.5 cursor-pointer"
                  >
                    Unlock
                  </button>
                </form>
              ) : (
                <>
                  <section className="mb-8">
                    <h3 className="font-mono text-xs text-muted-2 tracking-widest mb-3">
                      Set event date
                    </h3>
                    <form
                      onSubmit={(e) => void saveEventDate(e)}
                      className="flex flex-col sm:flex-row gap-3"
                    >
                      <input
                        type="date"
                        value={adminDateInput}
                        onChange={(e) => setAdminDateInput(e.target.value)}
                        className="flex-1 bg-bg border border-border text-white font-mono text-base px-3 py-3.5"
                      />
                      <button
                        type="submit"
                        disabled={savingDate}
                        className="bg-orange text-white font-display font-semibold text-base uppercase tracking-widest px-6 py-3.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        {savingDate ? 'SAVING…' : 'SAVE'}
                      </button>
                    </form>
                  </section>

                  <section>
                    <h3 className="font-mono text-xs text-muted-2 tracking-widest mb-3">
                      Full roster
                    </h3>
                    <div className="space-y-1">
                      <AdminHostRow
                        time={`${HOST_OPEN.start} – ${HOST_OPEN.end}`}
                        name="MrMerchBot"
                        sublabel={HOST_OPEN.label}
                      />
                      {SLOTS.map((slot) => {
                        const booked = bookings[slot.hour]
                        return (
                          <div
                            key={slot.hour}
                            className="flex flex-col gap-2.5 px-3 py-3 border-b border-border-subtle sm:flex-row sm:items-center sm:gap-2 sm:py-2"
                          >
                            <div className="flex items-baseline gap-2 sm:gap-2 shrink-0 flex-wrap">
                              <span className="font-mono text-xs text-muted-2 w-9 text-right sm:text-left">
                                #{String(slot.position).padStart(2, '0')}
                              </span>
                              <span className="font-mono text-[11px] sm:text-xs text-muted min-w-0">
                                {slot.start} – {slot.end}
                              </span>
                            </div>
                            {booked ? (
                              <div className="flex flex-col gap-2 min-w-0 sm:flex-row sm:items-center sm:flex-1 sm:justify-between sm:gap-2">
                                <span className="font-display text-sm sm:text-base font-semibold text-orange uppercase tracking-wide break-words sm:min-w-0 sm:truncate">
                                  {booked}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void removeSlot(slot.hour)}
                                  className="font-mono text-[10px] text-orange border border-orange px-3 py-2 min-h-10 tracking-widest w-full sm:w-auto sm:min-h-0 sm:px-2.5 sm:py-1.5 shrink-0 hover:bg-orange hover:text-white transition-colors cursor-pointer"
                                >
                                  REMOVE
                                </button>
                              </div>
                            ) : (
                              <span className="font-mono text-sm text-muted-2 sm:flex-1">
                                — OPEN —
                              </span>
                            )}
                          </div>
                        )
                      })}
                      <AdminHostRow
                        time={`${HOST_CLOSE.start} – ${HOST_CLOSE.end}`}
                        name="MrMerchBot"
                        sublabel={HOST_CLOSE.label}
                      />
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HostRow({ host }) {
  return (
    <div className="flex flex-col gap-2.5 py-3 border-b border-border-subtle bg-gradient-to-r from-yellow-500/5 to-transparent sm:flex-row sm:items-center sm:gap-3 sm:flex-wrap">
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <span className="w-8 text-right shrink-0 text-gold text-lg leading-none" aria-hidden>
          👑
        </span>
        <span className="font-mono text-sm text-gold-muted w-[6.5rem] sm:w-28 shrink-0 tabular-nums">
          {host.start}
        </span>
        <span className="text-yellow-900 shrink-0 text-lg hidden sm:inline" aria-hidden>
          →
        </span>
      </div>
      <span className="font-display text-lg sm:text-xl font-bold text-gold uppercase tracking-wide min-w-0 break-words sm:flex-1 sm:truncate">
        MrMerchBot
      </span>
      <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end sm:gap-3 sm:ml-auto sm:max-w-[min(100%,14rem)] md:max-w-[40%]">
        <span className="border border-gold-muted text-gold-muted font-mono text-[10px] px-2.5 py-1 tracking-widest text-left leading-tight flex-1 min-w-0 sm:flex-none sm:text-right">
          {host.label}
        </span>
        <span className="font-mono text-[10px] text-gold-muted tracking-wide shrink-0">
          10 min
        </span>
      </div>
    </div>
  )
}

function AdminHostRow({ time, name, sublabel }) {
  return (
    <div className="flex flex-col gap-2 px-3 py-3 mb-0.5 bg-gold-bg border-l-4 border-gold-muted sm:flex-row sm:items-start sm:gap-3 sm:flex-wrap">
      <span className="font-mono text-[11px] sm:text-xs text-gold-muted shrink-0 sm:w-40">
        {time}
      </span>
      <div className="flex-1 min-w-0 sm:min-w-[8rem]">
        <span className="font-display text-sm sm:text-base font-semibold text-gold uppercase tracking-wide block break-words">
          {name}
        </span>
        <span className="font-mono text-[11px] sm:text-xs text-gold-muted text-balance">
          {sublabel}
        </span>
      </div>
      <span className="font-mono text-[10px] text-gold-muted px-2.5 py-1 border border-gold-muted tracking-wide shrink-0 self-start">
        HOST
      </span>
    </div>
  )
}
