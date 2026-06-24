'use client';

import { useEffect, useState, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { ShieldCheck, Terminal, Send, Sparkles, RotateCcw, LogOut, Mail, KeyRound, UserPlus } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

interface TelemetryPacket {
  id: number;
  created_at: string;
  cpu_usage: number;
  ram_usage: number;
  gpu_usage: number;
  vram_usage: number;
  gpu_temp: number;
  disk_usage: number;
  net_up: number;
  net_down: number;
  battery_pct: number;
  battery_charging: boolean;
  gpu_power: number;
  gpu_clock: number;
  gpu_fan: number;
}

interface Message {
  role: 'user' | 'copilot';
  text: string;
  timestamp: string;
}

const INITIAL_MESSAGE: Message = {
  role: 'copilot',
  text: "Systems online. I have established a secure link to your isolated matrix partition. Ask me anything about your machine's performance.",
  timestamp: '',
};

// ─── Syntax-aware message renderer ────────────────────────────────────────────
function MessageContent({ text }: { text: string }) {
  const blockParts = text.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {blockParts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const inner = part.slice(3, -3).replace(/^[a-z]+\n/, ''); 
          return (
            <pre key={i} style={{
              margin: '6px 0 2px',
              padding: '8px 10px',
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 3,
              fontSize: 10,
              lineHeight: 1.7,
              overflowX: 'auto',
              color: '#a5f3b4',
              fontFamily: "'IBM Plex Mono', monospace",
              whiteSpace: 'pre',
            }}>
              {inner.trim()}
            </pre>
          );
        }

        const inlineParts = part.split(/(`[^`]+`)/g);
        return (
          <span key={i}>
            {inlineParts.map((chunk, j) => {
              if (chunk.startsWith('`') && chunk.endsWith('`')) {
                return (
                  <code key={j} style={{
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 3,
                    padding: '1px 5px',
                    fontSize: 10,
                    color: '#a5f3b4',
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}>
                    {chunk.slice(1, -1)}
                  </code>
                );
              }
              return <span key={j}>{chunk}</span>;
            })}
          </span>
        );
      })}
    </>
  );
}

// ─── Custom Tooltip ────────────────────────────────────────────────────────────
interface TooltipEntry { dataKey: string; value: number; color: string; }
interface CustomTooltipProps { active?: boolean; payload?: TooltipEntry[]; label?: string | number; }

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#0b121c',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 4,
      padding: '8px 12px',
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 11,
      minWidth: 148,
    }}>
      <div style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', marginBottom: 6 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
          <span style={{ color: p.color, letterSpacing: '0.08em' }}>{p.dataKey}</span>
          <span style={{ color: '#f0f4f8', fontWeight: 500 }}>{p.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  // 🔐 Authentication & Session Tracking States
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [authStatus, setAuthStatus] = useState<string>('System locked. Awaiting credentials...');
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // 📊 Telemetry Data States
  const [metrics, setMetrics] = useState<TelemetryPacket | null>(null);
  const [history, setHistory] = useState<TelemetryPacket[]>([]);
  const [status, setStatus] = useState<string>('Initializing security check...');

  // 🤖 AI States
  const [messages, setMessages] = useState<Message[]>([
    { ...INITIAL_MESSAGE, timestamp: new Date().toLocaleTimeString() }
  ]);
  const [input, setInput] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 🔌 Active Session Sync Hook
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsAuthenticated(true);
        setUserEmail(session.user.email ?? 'Authenticated Operator');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setIsAuthenticated(true);
        setUserEmail(session.user.email ?? 'Authenticated Operator');
      } else {
        setIsAuthenticated(false);
        setUserEmail(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 📡 Scoped Cloud Stream Telemetry Hook
  useEffect(() => {
    if (!isAuthenticated) return;

    let telemetrySubscription: RealtimeChannel | undefined;

    async function initializeSecurePipeline() {
      setStatus('Fetching secure data matrix profile...');
      
      const { data: initialHistory } = await supabase
        .from('telemetry').select('*')
        .order('created_at', { ascending: false }).limit(20);

      if (initialHistory) {
        const chronologicalHistory = [...initialHistory].reverse();
        setHistory(chronologicalHistory);
        if (chronologicalHistory.length > 0)
          setMetrics(chronologicalHistory[chronologicalHistory.length - 1]);
      }

      setStatus('Secure grid active. Monitoring real-time packets...');

      telemetrySubscription = supabase
        .channel('live-hardware-stream')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'telemetry' }, (payload) => {
          const newPacket = payload.new as TelemetryPacket;
          setMetrics(newPacket);
          setStatus('⚡ Live streaming synchronized.');
          setHistory((prev) => {
            const updated = [...prev, newPacket];
            return updated.length > 20 ? updated.slice(1) : updated;
          });
        }).subscribe();
    }

    initializeSecurePipeline();

    return () => {
      if (telemetrySubscription) supabase.removeChannel(telemetrySubscription);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAnalyzing]);

  // 🔑 Auth Handlers
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || isAuthLoading) return;

    setIsAuthLoading(true);
    setAuthStatus('Verifying security signatures with master server...');

    if (authMode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthStatus(`❌ Sign In Refused: ${error.message}`);
        setIsAuthLoading(false);
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setAuthStatus(`❌ Registration Refused: ${error.message}`);
        setIsAuthLoading(false);
      } else {
        setAuthStatus('✉️ Portal account validation sent! Check your inbox.');
        setIsAuthLoading(false);
      }
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setMetrics(null);
    setHistory([]);
    setAuthStatus('Identity revoked. Matrix console locked.');
  };

  // 💬 Copilot Route Dispatcher
  const handleQueryCopilot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isAnalyzing) return;

    const userPrompt = input.trim();
    setInput('');
    setMessages((prev) => [...prev, {
      role: 'user',
      text: userPrompt,
      timestamp: new Date().toLocaleTimeString(),
    }]);
    setIsAnalyzing(true);

    try {
      // Attach the current session JWT so the copilot can scope telemetry to this user
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('http://127.0.0.1:8000/api/copilot/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ message: userPrompt }),
      });

      if (!response.ok) throw new Error('API Gateway connection error');
      const data = await response.json();
      setMessages((prev) => [...prev, {
        role: 'copilot',
        text: data.analysis,
        timestamp: new Date().toLocaleTimeString(),
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        role: 'copilot',
        text: `❌ Critical Pipeline Fault: Unable to synchronize with Python AI Agent. Ensure your backend server is running.`,
        timestamp: new Date().toLocaleTimeString(),
      }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClearConversation = () => {
    setMessages([{ ...INITIAL_MESSAGE, timestamp: new Date().toLocaleTimeString() }]);
  };

  const cpu  = metrics?.cpu_usage  ?? 0;
  const ram  = metrics?.ram_usage  ?? 0;
  const gpu  = metrics?.gpu_usage  ?? 0;
  const temp = metrics?.gpu_temp   ?? 0;
  const vram = metrics?.vram_usage ?? 0;
  const disk = metrics?.disk_usage ?? 0;
  const netUp = metrics?.net_up ?? 0;
  const netDown = metrics?.net_down ?? 0;
  const batteryPct = metrics?.battery_pct ?? 0;
  const batteryCharging = metrics?.battery_charging ?? false;
  const gpuPower = metrics?.gpu_power ?? 0;
  const gpuClock = metrics?.gpu_clock ?? 0;
  const gpuFan = metrics?.gpu_fan ?? 0;

  const fmtRate = (kb: number) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB/s` : `${kb.toFixed(0)} KB/s`);

  const SEGS = 16;
  const filledSegs = Math.round((vram / 100) * SEGS);
  const formatTimeLabel = (ts: string) => { try { return new Date(ts).toTimeString().split(' ')[0]; } catch { return ''; } };

  const chartData = history.map(item => ({
    time: formatTimeLabel(item.created_at),
    CPU: item.cpu_usage,
    GPU: item.gpu_usage,
    RAM: item.ram_usage,
  }));

  const latestTime = metrics ? formatTimeLabel(metrics.created_at) : '—';
  const tickStyle = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fill: 'rgba(255,255,255,0.25)' };

  return (
    <main className="min-h-screen p-7 relative overflow-hidden" style={{ background: '#080c10', fontFamily: "'IBM Plex Mono', monospace" }}>
      <style>{`
        @keyframes msgIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .msg-in { animation: msgIn 0.18s ease forwards; }
        @keyframes segFill { 0% { transform: scaleY(0.6); opacity: 0.4; } 60% { transform: scaleY(1.08); opacity: 1; } 100% { transform: scaleY(1); opacity: 1; } }
        .seg-active { animation: segFill 0.3s ease forwards; }
      `}</style>

      {/* Grid texture background maps */}
      <div className="pointer-events-none absolute inset-0" style={{ background: `repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,.025) 39px,rgba(255,255,255,.025) 40px), repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,.025) 39px,rgba(255,255,255,.025) 40px)` }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'repeating-linear-gradient(180deg,transparent 0,transparent 2px,rgba(0,255,128,.012) 2px,rgba(0,255,128,.012) 4px)' }} />

      {/* 🛑 PORTAL A: SECURITY ENVELOPE HANDSHAKE SCREEN */}
      {!isAuthenticated ? (
        <div className="relative z-10 flex flex-col items-center justify-center min-h-[85vh]">
          <div className="w-full max-w-md p-6 border rounded" style={{ background: 'rgba(10,18,28,.95)', borderColor: authMode === 'signin' ? 'rgba(0, 255, 136, 0.15)' : 'rgba(167, 139, 250, 0.15)' }}>
            
            <div className="flex items-center gap-2 text-xs font-bold tracking-widest mb-6 uppercase" style={{ color: authMode === 'signin' ? '#00ff88' : '#a78bfa' }}>
              <Terminal className="w-4 h-4" />
              <span>AUTHENTICATION GATEWAY // CORE_{authMode.toUpperCase()}</span>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-neutral-600" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="OPERATOR IDENTITY EMAIL..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2.5 pl-10 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 font-mono"
                  required
                />
              </div>

              <div className="relative">
                <KeyRound className="absolute left-3 top-3 w-4 h-4 text-neutral-600" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="SECURITY PROFILE ACCESS CODE..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2.5 pl-10 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 font-mono"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isAuthLoading}
                className="w-full py-2.5 font-bold tracking-wider text-xs rounded transition-all cursor-pointer font-mono text-neutral-950"
                style={{ background: authMode === 'signin' ? '#00ff88' : '#a78bfa' }}
              >
                {authMode === 'signin' ? 'ESTABLISH LIVE PORTAL MATRIX' : 'CREATE PORTAL STORAGE ACCOUNT'}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-neutral-900 flex justify-between text-[11px] text-neutral-400 font-mono">
              {authMode === 'signin' ? (
                <>
                  <span>First deployment sequence?</span>
                  <button onClick={() => { setAuthMode('signup'); setAuthStatus('Awaiting new parameters...'); }} className="text-[#a78bfa] hover:underline cursor-pointer flex items-center gap-1"><UserPlus className="w-3 h-3" /> Create Account</button>
                </>
              ) : (
                <>
                  <span>Existing user partition?</span>
                  <button onClick={() => { setAuthMode('signin'); setAuthStatus('Awaiting verification...'); }} className="text-[#00ff88] hover:underline cursor-pointer flex items-center gap-1"><KeyRound className="w-3 h-3" /> Execute Login</button>
                </>
              )}
            </div>

            <div className="mt-4 p-2.5 rounded bg-neutral-950 border border-neutral-900 text-[10px] font-mono text-neutral-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full animate-ping shrink-0" style={{ background: authMode === 'signin' ? '#00ff88' : '#a78bfa' }} />
              <span className="uppercase">{authStatus}</span>
            </div>

          </div>
        </div>
      ) : (

        // 🔋 PORTAL B: AUTHENTICATED COCKPIT VIEW
        <>
          {/* ─── HEADER ─────────────────────────────────────────────────────────── */}
          <div className="relative z-10 flex justify-between items-end mb-8">
            <div>
              <p className="text-xs tracking-widest mb-1.5 flex items-center gap-2" style={{ color: '#00ff88', letterSpacing: '0.22em' }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#00ff88' }} />
                OPERATOR PROFILE LOGGED IN: {userEmail?.toUpperCase()}
              </p>
              <h1 className="text-3xl font-extrabold tracking-tight leading-none m-0 text-neutral-100">
                RTX <span style={{ color: '#00ff88' }}>4060</span> Matrix
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs tracking-widest" style={{ border: '1px solid rgba(0,255,136,.3)', background: 'rgba(0,255,136,.07)', color: '#00ff88', borderRadius: 4 }}>
                <ShieldCheck className="w-3.5 h-3.5" />
                {status.toUpperCase()}
              </div>
              <button onClick={handleSignOut} className="px-3 py-1.5 border border-red-500/30 bg-red-950/20 text-red-400 hover:bg-red-950/50 rounded text-xs tracking-wider font-mono flex items-center gap-1.5 cursor-pointer transition-colors">
                <LogOut className="w-3.5 h-3.5" /> DISCONNECT
              </button>
            </div>
          </div>

          {/* ─── TOP 4 METRIC CARDS ──────────────────────────────────────────────── */}
          <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
            {[
              { label: 'PROCESSOR CORE',   value: `${cpu.toFixed(1)}%`,   bar: cpu,                   sub: 'active cpu execution load',   accent: '#38bdf8', icon: '▣' },
              { label: 'SYSTEM MEMORY',    value: `${ram.toFixed(1)}%`,   bar: ram,                   sub: 'volatile memory saturation',   accent: '#a78bfa', icon: '◈' },
              { label: 'NVIDIA RTX 4060', value: `${gpu.toFixed(1)}%`,   bar: gpu,                   sub: 'graphics engine utilization', accent: '#34d399', icon: '◉' },
              { label: 'THERMAL ARRAY',   value: `${temp.toFixed(0)}°C`, bar: Math.min(temp, 100),   sub: 'silicon temperature junction', accent: '#f87171', icon: '◎' },
            ].map(({ label, value, bar, sub, accent, icon }) => (
              <div key={label} className="relative overflow-hidden" style={{ background: 'rgba(10,18,28,.9)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 6, padding: '20px 18px 16px' }}>
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
                <div className="flex justify-between items-center mb-3.5" style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,.3)' }}>
                  <span>{label}</span>
                  <span style={{ color: accent, fontSize: 13 }}>{icon}</span>
                </div>
                <div className="mb-3 leading-none text-4xl font-extrabold tracking-tight text-neutral-100">{value}</div>
                <div className="mb-2.5" style={{ height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${bar}%`, background: accent, borderRadius: 2, transition: 'width .6s cubic-bezier(.16,1,.3,1)' }} />
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.2)', letterSpacing: '0.06em' }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* ─── EXTENDED SPEC CARDS ─────────────────────────────────────────────── */}
          <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
            {[
              { label: 'DISK VOLUME C:',  value: `${disk.toFixed(1)}%`, bar: disk,                          sub: 'primary partition saturation', accent: '#fbbf24', icon: '▤' },
              { label: 'BATTERY CELL',    value: `${batteryPct.toFixed(0)}%`, bar: batteryPct,              sub: batteryCharging ? '⚡ charging — ac connected' : 'discharging on battery', accent: batteryCharging ? '#4ade80' : '#facc15', icon: '⊟' },
              { label: 'GPU POWER DRAW',  value: `${gpuPower.toFixed(1)}W`, bar: Math.min((gpuPower / 115) * 100, 100), sub: `clock ${gpuClock.toFixed(0)}mhz · fan ${gpuFan.toFixed(0)}%`, accent: '#22d3ee', icon: '⌁' },
            ].map(({ label, value, bar, sub, accent, icon }) => (
              <div key={label} className="relative overflow-hidden" style={{ background: 'rgba(10,18,28,.9)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 6, padding: '20px 18px 16px' }}>
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
                <div className="flex justify-between items-center mb-3.5" style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,.3)' }}>
                  <span>{label}</span>
                  <span style={{ color: accent, fontSize: 13 }}>{icon}</span>
                </div>
                <div className="mb-3 leading-none text-4xl font-extrabold tracking-tight text-neutral-100">{value}</div>
                <div className="mb-2.5" style={{ height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${bar}%`, background: accent, borderRadius: 2, transition: 'width .6s cubic-bezier(.16,1,.3,1)' }} />
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.2)', letterSpacing: '0.06em' }}>{sub}</div>
              </div>
            ))}

            {/* Network throughput — dual up/down readout */}
            <div className="relative overflow-hidden" style={{ background: 'rgba(10,18,28,.9)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 6, padding: '20px 18px 16px' }}>
              <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: 'linear-gradient(90deg, #818cf8, transparent)' }} />
              <div className="flex justify-between items-center mb-3.5" style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,.3)' }}>
                <span>NETWORK I/O</span>
                <span style={{ color: '#818cf8', fontSize: 13 }}>⇅</span>
              </div>
              <div className="flex items-baseline gap-2 mb-1.5">
                <span style={{ color: '#4ade80', fontSize: 13 }}>↓</span>
                <span className="leading-none text-2xl font-extrabold tracking-tight text-neutral-100">{fmtRate(netDown)}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span style={{ color: '#f87171', fontSize: 13 }}>↑</span>
                <span className="leading-none text-2xl font-extrabold tracking-tight text-neutral-100">{fmtRate(netUp)}</span>
              </div>
              <div className="mt-2" style={{ fontSize: 10, color: 'rgba(255,255,255,.2)', letterSpacing: '0.06em' }}>aggregate interface throughput</div>
            </div>
          </div>

          {/* ─── TIMELINE CHART ──────────────────────────────────────────────────── */}
          <div className="relative z-10 mb-4 overflow-hidden" style={{ background: 'rgba(10,18,28,.9)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 6, padding: '20px 20px 14px' }}>
            <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: 'linear-gradient(90deg,#00ff88,transparent)' }} />
            <div className="flex justify-between items-center mb-4">
              <span style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,.3)' }}>HISTORICAL COMPUTE TIMELINE</span>
              <div className="flex items-center gap-4">
                {[{ key: 'CPU', color: '#38bdf8' }, { key: 'GPU', color: '#34d399' }, { key: 'RAM', color: '#a78bfa' }].map(({ key, color }) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <div style={{ width: 20, height: 2, background: color, borderRadius: 1 }} />
                    <span style={{ fontSize: 9, letterSpacing: '0.14em', color: 'rgba(255,255,255,.35)' }}>{key}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ width: '100%', height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradCPU" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#38bdf8" stopOpacity={0.18} /><stop offset="100%" stopColor="#38bdf8" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gradGPU" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={0.22} /><stop offset="100%" stopColor="#34d399" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gradRAM" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" stopOpacity={0.14} /><stop offset="100%" stopColor="#a78bfa" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="1 6" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="time" stroke="transparent" tick={tickStyle} tickLine={false} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} stroke="transparent" tick={tickStyle} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }} />
                  <Area type="monotone" dataKey="CPU" stroke="#38bdf8" strokeWidth={1.5} fill="url(#gradCPU)" dot={false} activeDot={{ r: 3, fill: '#38bdf8', strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="GPU" stroke="#34d399" strokeWidth={2} fill="url(#gradGPU)" dot={false} activeDot={{ r: 3, fill: '#34d399', strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="RAM" stroke="#a78bfa" strokeWidth={1} fill="url(#gradRAM)" dot={false} activeDot={{ r: 3, fill: '#a78bfa', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ─── BOTTOM ROW: VRAM & SYSTEM LOGS ──────────────────────────────────── */}
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-4">
            <div className="relative overflow-hidden" style={{ background: 'rgba(10,18,28,.9)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 6, padding: 18 }}>
              <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: 'linear-gradient(90deg,#fb923c,transparent)' }} />
              <div className="flex justify-between items-baseline mb-1">
                <span style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,.3)' }}>VRAM UTILIZATION</span>
                <span className="text-2xl font-extrabold text-[#fb923c]">{vram.toFixed(1)}%</span>
              </div>
              <div className="mb-3" style={{ fontSize: 10, color: 'rgba(255,255,255,.15)', letterSpacing: '0.06em' }}>≈ {((vram / 100) * 8).toFixed(2)} GB / 8 GB used</div>
              <div className="flex gap-1" style={{ height: 24 }}>
                {Array.from({ length: SEGS }, (_, i) => {
                  const active = i < filledSegs;
                  return (
                    <div
                      key={i}
                      className={active ? 'seg-active' : ''}
                      style={{
                        flex: 1,
                        borderRadius: 2,
                        background: active ? '#fb923c' : 'rgba(255,255,255,.04)',
                        animationDelay: active ? `${i * 30}ms` : '0ms',
                        transformOrigin: 'bottom',
                      }}
                    />
                  );
                })}
              </div>
            </div>

            <div className="relative overflow-hidden" style={{ background: 'rgba(10,18,28,.9)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 6, padding: 18 }}>
              {[
                ['SYS:0001', 'tenant authentication',   'SECURE_OK'],
                ['SYS:0002', 'row_level isolation',    'ENFORCED'],
                ['SYS:0003', 'realtime ws subscription', 'LIVE'],
                ['SYS:0004', 'last packet received',      latestTime],
              ].map(([time, event, val]) => (
                <div key={time} className="flex gap-2.5 items-baseline" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'rgba(255,255,255,.25)', lineHeight: 2 }}>
                  <span style={{ color: 'rgba(0,255,136,.4)', minWidth: 70 }}>{time}</span>
                  <span>{event}</span>
                  <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,.4)' }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ─── AI COPILOT INTERFACE ────────────────────────────────────────────── */}
          <div className="relative z-10 overflow-hidden flex flex-col" style={{ background: 'rgba(10,18,28,.95)', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 6, minHeight: 260, maxHeight: 420 }}>
            <div className="px-4 py-2.5 flex justify-between items-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.25)', flexShrink: 0 }}>
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-200 tracking-wider">
                <Terminal className="w-3.5 h-3.5 text-[#00ff88]" />
                <span>AI CORE INTERFACE // MULTI_TENANT_COPILOT</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleClearConversation} className="flex items-center gap-1.5 text-[9px] tracking-widest transition-colors font-mono border-none bg-none text-neutral-500 hover:text-neutral-300 cursor-pointer">
                  <RotateCcw className="w-3 h-3" /> CLEAR
                </button>
                <div className="flex items-center gap-1.5 text-[9px] font-mono text-neutral-500 tracking-widest">
                  <Sparkles className="w-3.5 h-3.5 animate-spin text-emerald-500/70" style={{ animationDuration: '4s' }} />
                  <span>GEMINI_2.5_FLASH</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs font-mono" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
              {messages.map((msg, idx) => (
                <div key={idx} className={`msg-in flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`} style={{ animationDelay: `${idx === messages.length - 1 ? 0 : 999}s` }}>
                  <div className={`px-2 py-0.5 font-bold h-fit rounded text-[10px] uppercase tracking-wider flex-shrink-0 ${msg.role === 'user' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'bg-emerald-500/10 text-[#00ff88] border border-emerald-500/20'}`}>
                    {msg.role === 'user' ? 'OPERATOR' : 'CORE'}
                  </div>
                  <div>
                    <div className="leading-relaxed p-2.5 rounded bg-neutral-900/40 text-neutral-200 border border-neutral-800/50 whitespace-pre-line" style={{ textShadow: msg.role === 'copilot' ? '0 0 1px rgba(0,255,136,0.1)' : 'none' }}>
                      <MessageContent text={msg.text} />
                    </div>
                    <div suppressHydrationWarning style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)', marginTop: 3, letterSpacing: '0.08em', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                      {msg.timestamp}
                    </div>
                  </div>
                </div>
              ))}

              {isAnalyzing && (
                <div className="flex gap-3 max-w-[80%] items-center text-xs text-emerald-400 animate-pulse tracking-wide">
                  <div className="px-2 py-0.5 font-bold bg-emerald-500/10 text-[#00ff88] border border-emerald-500/20 rounded text-[10px] flex-shrink-0">CORE</div>
                  <span>Analyzing isolated user space data matrices, please stand by...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleQueryCopilot} className="p-2 flex gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)', flexShrink: 0 }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Input command query (e.g., 'Analyze efficiency')..."
                className="flex-1 bg-neutral-950/80 border border-neutral-800 rounded px-3 py-2 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-[#00ff88] transition-colors font-mono"
                disabled={isAnalyzing}
              />
              <button type="submit" disabled={isAnalyzing || !input.trim()} className="px-4 bg-emerald-950/40 hover:bg-emerald-900/60 text-[#00ff88] border border-emerald-500/30 rounded flex items-center justify-center transition-all disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer">
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </>
      )}
    </main>
  );
}