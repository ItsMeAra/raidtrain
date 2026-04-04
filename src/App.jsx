import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";

const SLOTS = Array.from({ length: 15 }, (_, i) => {
  const hour = 9 + i;
  const fmt = (h) => {
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:00 ${ampm}`;
  };
  return { hour, start: fmt(hour), end: fmt(hour + 1), position: i + 1 };
});

const HOST_OPEN  = { id: "host-open",  start: "8:50 AM",  end: "9:00 AM",  label: "OPENS THE RAID TRAIN", isHost: true };
const HOST_CLOSE = { id: "host-close", start: "12:00 AM", end: "12:10 AM", label: "CLOSES THE RAID TRAIN", isHost: true };

const ADMIN_PW = import.meta.env.VITE_ADMIN_PASSWORD || "raidtrain";

export default function App() {
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "" });
  const [confirmation, setConfirmation] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPwInput, setAdminPwInput] = useState("");
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminDateInput, setAdminDateInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // ── Font injection ──────────────────────────────────────────────────────────
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #0a0a0a; }
      @keyframes pulseGlow {
        0%, 100% { box-shadow: 0 0 0 0 rgba(255,69,0,0.4); }
        50% { box-shadow: 0 0 12px 4px rgba(255,69,0,0.15); }
      }
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(16px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes sheetUp {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .slot-row { animation: slideUp 0.35s ease both; }
      .claim-btn {
        animation: pulseGlow 2.5s ease-in-out infinite;
        transition: all 0.15s ease !important;
      }
      .claim-btn:hover {
        background: #FF4500 !important;
        color: white !important;
        transform: translateX(4px);
      }
      .modal-overlay { animation: fadeIn 0.2s ease; }
      .modal-card { animation: slideUp 0.25s ease; }
      .sheet-card { animation: sheetUp 0.3s cubic-bezier(0.32,0.72,0,1); }
      input, button { font-family: inherit; }
      input:focus { outline: none; border-color: #FF4500 !important; box-shadow: 0 0 0 2px rgba(255,69,0,0.15); }
      ::-webkit-scrollbar { width: 4px; }
      ::-webkit-scrollbar-track { background: #111; }
      ::-webkit-scrollbar-thumb { background: #444; }
      .remove-btn:hover { border-color: #FF4500 !important; color: #FF4500 !important; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // ── Load data from Supabase ─────────────────────────────────────────────────
  useEffect(() => {
    loadData();

    // Real-time subscription so all open tabs/browsers stay in sync
    const channel = supabase
      .channel("raid-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "raid_slots" }, loadSlots)
      .on("postgres_changes", { event: "*", schema: "public", table: "raid_config" }, loadConfig)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const loadConfig = async () => {
    const { data } = await supabase
      .from("raid_config")
      .select("event_date")
      .eq("id", "singleton")
      .single();
    if (data?.event_date) setDate(data.event_date);
  };

  const loadSlots = async () => {
    const { data } = await supabase.from("raid_slots").select("*");
    if (data) {
      const map = {};
      data.forEach(row => { map[row.hour] = { name: row.show_name }; });
      setSlots(map);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadConfig(), loadSlots()]);
    } catch (e) {
      setError("Could not connect to database. Check your Supabase credentials.");
    }
    setLoading(false);
  };

  // ── Claim a slot ────────────────────────────────────────────────────────────
  const claimSlot = async () => {
    if (!form.name.trim() || !modal || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from("raid_slots")
      .insert({ hour: modal.hour, show_name: form.name.trim() });

    if (error) {
      if (error.code === "23505") {
        alert("That slot was just taken! Please pick another.");
        await loadSlots();
      } else {
        alert("Error saving. Please try again.");
      }
    } else {
      setSlots(p => ({ ...p, [modal.hour]: { name: form.name.trim() } }));
      setConfirmation({ slot: modal, name: form.name.trim() });
      setModal(null);
      setForm({ name: "" });
    }
    setSaving(false);
  };

  // ── Admin actions ───────────────────────────────────────────────────────────
  const adminLogin = () => {
    if (adminPwInput === ADMIN_PW) { setAdminAuthed(true); setAdminPwInput(""); }
    else alert("Wrong password.");
  };

  const saveDate = async () => {
    if (!adminDateInput) return;
    const d = new Date(adminDateInput + "T12:00:00");
    const formatted = d.toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric"
    });
    await supabase
      .from("raid_config")
      .upsert({ id: "singleton", event_date: formatted });
    setDate(formatted);
  };

  const removeSlot = async (hour) => {
    if (!window.confirm("Remove this booking?")) return;
    await supabase.from("raid_slots").delete().eq("hour", hour);
    setSlots(p => { const n = { ...p }; delete n[hour]; return n; });
  };

  const filledCount = Object.keys(slots).length;

  // ── Styles ──────────────────────────────────────────────────────────────────
  const S = {
    app: { minHeight: "100vh", background: "#0a0a0a", color: "white", fontFamily: "'Oswald', sans-serif", paddingBottom: "80px" },
    header: { borderBottom: "1px solid #1f1f1f", padding: "36px 24px 28px", textAlign: "center", position: "relative" },
    eyebrow: { fontFamily: "'Space Mono', monospace", fontSize: "10px", letterSpacing: "4px", color: "#FF4500", marginBottom: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" },
    dot: { width: "6px", height: "6px", borderRadius: "50%", background: "#FF4500", display: "inline-block", animation: "pulseGlow 2s infinite" },
    h1: { fontSize: "clamp(36px, 7vw, 72px)", fontWeight: 700, letterSpacing: "-1px", lineHeight: 1, textTransform: "uppercase" },
    dateLine: { marginTop: "12px", fontFamily: "'Space Mono', monospace", fontSize: "12px", letterSpacing: "1px" },
    stats: { display: "flex", justifyContent: "center", marginTop: "24px", border: "1px solid #1a1a1a", maxWidth: "280px", margin: "24px auto 0" },
    statItem: { flex: 1, padding: "12px 8px", textAlign: "center" },
    statNum: (color) => ({ fontSize: "26px", fontWeight: 700, color: color || "white", fontFamily: "'Space Mono', monospace" }),
    statLabel: { fontSize: "9px", fontFamily: "'Space Mono', monospace", color: "#7a7a7a", letterSpacing: "2px", marginTop: "2px" },
    grid: { maxWidth: "680px", margin: "0 auto", padding: "8px 16px 0" },
    slotRow: (i) => ({ display: "flex", alignItems: "center", borderBottom: "1px solid #141414", padding: "12px 0", gap: "12px", animationDelay: `${i * 0.03}s` }),
    posNum: { fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "#7a7a7a", width: "28px", flexShrink: 0, textAlign: "right" },
    timeLabel: (booked) => ({ fontFamily: "'Space Mono', monospace", fontSize: "12px", color: booked ? "#7a7a7a" : "#909090", width: "95px", flexShrink: 0 }),
    arrow: (booked) => ({ color: booked ? "#3a3a3a" : "#444", fontSize: "14px", flexShrink: 0 }),
    showName: { flex: 1, fontSize: "18px", fontWeight: 600, color: "#FF4500", textTransform: "uppercase", letterSpacing: "0.5px" },
    badge: { background: "#FF4500", color: "white", fontSize: "9px", fontFamily: "'Space Mono', monospace", padding: "3px 8px", letterSpacing: "2px", flexShrink: 0 },
    claimBtn: { background: "transparent", border: "1px solid #FF4500", color: "#FF4500", padding: "8px 18px", fontSize: "12px", fontFamily: "'Oswald', sans-serif", letterSpacing: "2px", cursor: "pointer", textTransform: "uppercase", fontWeight: 600 },
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "20px" },
    modalCard: { background: "#111", border: "1px solid #FF4500", padding: "32px", width: "100%", maxWidth: "400px" },
    fieldLabel: { display: "block", fontSize: "10px", fontFamily: "'Space Mono', monospace", color: "#909090", letterSpacing: "2px", marginBottom: "8px" },
    input: { width: "100%", background: "#0a0a0a", border: "1px solid #444", color: "white", padding: "12px 14px", fontSize: "17px", fontFamily: "'Oswald', sans-serif", letterSpacing: "0.5px", transition: "border-color 0.15s, box-shadow 0.15s" },
    primaryBtn: (active) => ({ flex: 1, background: active ? "#FF4500" : "#1c1c1c", border: "none", color: active ? "white" : "#666", padding: "14px", fontSize: "16px", fontFamily: "'Oswald', sans-serif", letterSpacing: "2px", cursor: active ? "pointer" : "not-allowed", fontWeight: 600, textTransform: "uppercase", transition: "background 0.2s" }),
    cancelBtn: { background: "transparent", border: "1px solid #444", color: "#909090", padding: "14px 18px", fontSize: "14px", fontFamily: "'Oswald', sans-serif", letterSpacing: "1px", cursor: "pointer" },
    adminBtn: { position: "fixed", bottom: "20px", right: "20px", background: "#111", border: "1px solid #444", color: "#909090", padding: "8px 14px", fontSize: "9px", fontFamily: "'Space Mono', monospace", letterSpacing: "2px", cursor: "pointer", zIndex: 100, transition: "all 0.15s" },
    sheetOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 400 },
    sheet: { background: "#111", border: "1px solid #1f1f1f", borderBottom: "none", padding: "28px 24px", width: "100%", maxWidth: "640px", maxHeight: "82vh", overflowY: "auto" },
    rosterRow: (booked) => ({ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: booked ? "#161616" : "transparent", borderLeft: `3px solid ${booked ? "#FF4500" : "#2a2a2a"}`, marginBottom: "3px" }),
  };

  if (loading) return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", letterSpacing: "4px", color: "#FF4500" }}>
        LOADING SCHEDULE...
      </div>
    </div>
  );

  if (error) return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
      <div style={{ textAlign: "center", maxWidth: "400px" }}>
        <div style={{ fontSize: "32px", marginBottom: "16px" }}>⚠️</div>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "12px", color: "#FF4500", letterSpacing: "2px", marginBottom: "12px" }}>CONNECTION ERROR</div>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", color: "#909090", lineHeight: 1.6 }}>{error}</div>
      </div>
    </div>
  );

  return (
    <div style={S.app}>
      {/* ── HEADER ── */}
      <div style={S.header}>
        <div style={S.eyebrow}>
          <span style={S.dot} />
          WHATNOT RAID TRAIN
          <span style={S.dot} />
        </div>
        <h1 style={S.h1}>RAID SCHEDULE</h1>
        <div style={S.dateLine}>
          {date
            ? <span style={{ color: "#888" }}>{date.toUpperCase()} · ALL TIMES ET</span>
            : <span style={{ color: "#7a7a7a" }}>DATE TBD — ADMIN SETS THE DATE · ALL TIMES ET</span>
          }
        </div>
        <div style={S.stats}>
          <div style={{ ...S.statItem, borderRight: "1px solid #1a1a1a" }}>
            <div style={S.statNum("#FF4500")}>{filledCount}</div>
            <div style={S.statLabel}>BOOKED</div>
          </div>
          <div style={{ ...S.statItem, borderRight: "1px solid #1a1a1a" }}>
            <div style={S.statNum()}>{15 - filledCount}</div>
            <div style={S.statLabel}>OPEN</div>
          </div>
          <div style={S.statItem}>
            <div style={S.statNum()}>15</div>
            <div style={S.statLabel}>SLOTS</div>
          </div>
        </div>
        <div style={{ marginTop: "16px", fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "#7a7a7a", letterSpacing: "1px" }}>
          Each slot = 1 hour · Pick your time · Each show raids the next in line
        </div>
      </div>

      {/* ── SCHEDULE GRID ── */}
      <div style={S.grid}>
        <HostRow slot={HOST_OPEN} index={-1} />

        {SLOTS.map((slot, i) => {
          const booked = slots[slot.hour];
          return (
            <div key={slot.hour} className="slot-row" style={S.slotRow(i)}>
              <div style={S.posNum}>#{String(slot.position).padStart(2, "0")}</div>
              <div style={S.timeLabel(booked)}>{slot.start} ET</div>
              <div style={S.arrow(booked)}>→</div>
              {booked ? (
                <>
                  <div style={S.showName}>{booked.name}</div>
                  <div style={S.badge}>BOOKED</div>
                </>
              ) : (
                <button className="claim-btn" onClick={() => setModal(slot)} style={S.claimBtn}>
                  CLAIM SLOT
                </button>
              )}
            </div>
          );
        })}

        <HostRow slot={HOST_CLOSE} index={15} />
      </div>

      {/* ── ADMIN BUTTON ── */}
      <button onClick={() => setAdminOpen(true)} style={S.adminBtn}>⚙ ADMIN</button>

      {/* ── SIGNUP MODAL ── */}
      {modal && (
        <div className="modal-overlay" style={S.overlay} onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-card" style={S.modalCard}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "#FF4500", letterSpacing: "3px", marginBottom: "6px" }}>
              CLAIM YOUR SLOT
            </div>
            <h2 style={{ fontSize: "42px", fontWeight: 700, textTransform: "uppercase", lineHeight: 1, marginBottom: "4px" }}>
              {modal.start}
            </h2>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", color: "#909090", marginBottom: "28px" }}>
              {modal.start} → {modal.end} ET · Slot #{String(modal.position).padStart(2, "0")}
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label style={S.fieldLabel}>YOUR WHATNOT USERNAME / SHOW NAME</label>
              <input
                type="text"
                placeholder="@yourwhatnotname"
                value={form.name}
                onChange={e => setForm({ name: e.target.value })}
                onKeyDown={e => e.key === "Enter" && claimSlot()}
                style={S.input}
                autoFocus
              />
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={claimSlot} disabled={!form.name.trim() || saving} style={S.primaryBtn(form.name.trim() && !saving)}>
                {saving ? "SAVING..." : "LOCK IT IN 🔒"}
              </button>
              <button onClick={() => { setModal(null); setForm({ name: "" }); }} style={S.cancelBtn}>
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRMATION ── */}
      {confirmation && (
        <div className="modal-overlay" style={{ ...S.overlay, zIndex: 300 }} onClick={() => setConfirmation(null)}>
          <div className="modal-card" style={{ ...S.modalCard, textAlign: "center", border: "2px solid #FF4500", padding: "40px 32px" }}>
            <div style={{ fontSize: "52px", marginBottom: "16px" }}>🔥</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "#FF4500", letterSpacing: "3px", marginBottom: "8px" }}>
              YOU'RE IN THE RAID TRAIN
            </div>
            <h2 style={{ fontSize: "44px", fontWeight: 700, textTransform: "uppercase", lineHeight: 1, marginBottom: "4px" }}>
              {confirmation.slot.start} ET
            </h2>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", color: "#909090", marginBottom: "24px" }}>
              {confirmation.slot.start} → {confirmation.slot.end} ET · Slot #{String(confirmation.slot.position).padStart(2, "0")}
              {date && ` · ${date}`}
            </div>
            <div style={{ background: "#0a0a0a", border: "1px solid #1f1f1f", padding: "18px", marginBottom: "20px" }}>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "#FF4500", textTransform: "uppercase" }}>
                {confirmation.name}
              </div>
            </div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "#909090", lineHeight: 1.7, marginBottom: "24px" }}>
              📸 Screenshot this as your confirmation!<br />
              You'll raid the next show in the lineup.
            </div>
            <button
              onClick={() => setConfirmation(null)}
              style={{ background: "#FF4500", border: "none", color: "white", padding: "14px 40px", fontSize: "18px", fontFamily: "'Oswald', sans-serif", letterSpacing: "2px", cursor: "pointer", fontWeight: 600, textTransform: "uppercase" }}
            >
              LET'S GOOO 🔥
            </button>
          </div>
        </div>
      )}

      {/* ── ADMIN SHEET ── */}
      {adminOpen && (
        <div style={S.sheetOverlay} onClick={e => e.target === e.currentTarget && setAdminOpen(false)}>
          <div className="sheet-card" style={S.sheet}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", letterSpacing: "3px", color: "#FF4500" }}>⚙ ADMIN PANEL</div>
              <button onClick={() => setAdminOpen(false)} style={{ background: "none", border: "none", color: "#909090", cursor: "pointer", fontSize: "22px", lineHeight: 1 }}>×</button>
            </div>

            {!adminAuthed ? (
              <div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "#909090", letterSpacing: "2px", marginBottom: "10px" }}>PASSWORD</div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <input
                    type="password"
                    value={adminPwInput}
                    onChange={e => setAdminPwInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && adminLogin()}
                    placeholder="Enter admin password"
                    style={{ ...S.input, flex: 1 }}
                    autoFocus
                  />
                  <button onClick={adminLogin} style={{ background: "#FF4500", border: "none", color: "white", padding: "12px 24px", fontSize: "15px", fontFamily: "'Oswald', sans-serif", letterSpacing: "2px", cursor: "pointer", fontWeight: 600 }}>
                    ENTER
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Date setter */}
                <div style={{ marginBottom: "32px", paddingBottom: "28px", borderBottom: "1px solid #1a1a1a" }}>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "#909090", letterSpacing: "2px", marginBottom: "10px" }}>SET EVENT DATE</div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <input type="date" value={adminDateInput} onChange={e => setAdminDateInput(e.target.value)} style={{ ...S.input, flex: 1, colorScheme: "dark" }} />
                    <button onClick={saveDate} style={{ background: "#FF4500", border: "none", color: "white", padding: "12px 20px", fontSize: "14px", fontFamily: "'Oswald', sans-serif", letterSpacing: "2px", cursor: "pointer", fontWeight: 600 }}>SAVE</button>
                  </div>
                  {date && <div style={{ marginTop: "8px", fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "#FF4500" }}>Current: {date}</div>}
                </div>

                {/* Roster */}
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "#909090", letterSpacing: "2px", marginBottom: "12px" }}>
                  FULL ROSTER — {filledCount}/{SLOTS.length} SLOTS BOOKED
                </div>
                <div>
                  <AdminHostRow slot={HOST_OPEN} />
                  {SLOTS.map(slot => {
                    const booked = slots[slot.hour];
                    return (
                      <div key={slot.hour} style={S.rosterRow(booked)}>
                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "#7a7a7a", width: "24px", flexShrink: 0 }}>
                          #{String(slot.position).padStart(2, "0")}
                        </div>
                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "#909090", width: "80px", flexShrink: 0 }}>
                          {slot.start}
                        </div>
                        {booked ? (
                          <>
                            <div style={{ flex: 1, fontSize: "15px", fontWeight: 600, color: "#FF4500", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                              {booked.name}
                            </div>
                            <button
                              className="remove-btn"
                              onClick={() => removeSlot(slot.hour)}
                              style={{ background: "none", border: "1px solid #444", color: "#909090", padding: "4px 10px", fontSize: "9px", fontFamily: "'Space Mono', monospace", cursor: "pointer", letterSpacing: "1px", flexShrink: 0, transition: "all 0.15s" }}
                            >
                              REMOVE
                            </button>
                          </>
                        ) : (
                          <div style={{ flex: 1, fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "#7a7a7a" }}>— OPEN —</div>
                        )}
                      </div>
                    );
                  })}
                  <AdminHostRow slot={HOST_CLOSE} />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HostRow({ slot, index }) {
  return (
    <div
      className="slot-row"
      style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #1a1a1a", padding: "14px 0", gap: "12px", animationDelay: `${index * 0.03}s`, background: "linear-gradient(90deg, rgba(255,193,7,0.04) 0%, transparent 100%)" }}
    >
      <div style={{ width: "28px", flexShrink: 0, textAlign: "right", fontSize: "13px" }}>👑</div>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "12px", color: "#a88c00", width: "95px", flexShrink: 0 }}>{slot.start} ET</div>
      <div style={{ color: "#4a4000", fontSize: "14px", flexShrink: 0 }}>→</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ fontSize: "18px", fontWeight: 700, color: "#FFC107", textTransform: "uppercase", letterSpacing: "0.5px" }}>MrMerchBot</div>
        <div style={{ background: "transparent", border: "1px solid #a88c00", color: "#a88c00", fontSize: "9px", fontFamily: "'Space Mono', monospace", padding: "3px 8px", letterSpacing: "2px", flexShrink: 0 }}>{slot.label}</div>
      </div>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "9px", color: "#a88c00", letterSpacing: "1px", flexShrink: 0 }}>10 MIN</div>
    </div>
  );
}

function AdminHostRow({ slot }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", marginBottom: "3px", background: "#161400", borderLeft: "3px solid #a88c00" }}>
      <div style={{ fontSize: "12px", width: "24px", flexShrink: 0 }}>👑</div>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "#a88c00", width: "80px", flexShrink: 0 }}>{slot.start}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "#FFC107", textTransform: "uppercase", letterSpacing: "0.5px" }}>MrMerchBot</div>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "#a88c00" }}>{slot.label} · 10 min</div>
      </div>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "9px", color: "#a88c00", padding: "3px 8px", border: "1px solid #a88c00", letterSpacing: "1px" }}>HOST</div>
    </div>
  );
}
