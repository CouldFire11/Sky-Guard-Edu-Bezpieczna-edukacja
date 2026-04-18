"use client";

import { useEffect, useState, useRef } from "react";
import { AlertTriangle, ShieldCheck, Video, Map, Bell, Battery, Crosshair, Users } from "lucide-react";

export default function Dashboard() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [droneStatus, setDroneStatus] = useState<any>({ state: "offline", battery_pct: 0 });
  const [toasts, setToasts] = useState<any[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const [cameraError, setCameraError] = useState(false);

  useEffect(() => {
    // WebSocket — połączenie bezpośrednio do backendu (port 8000)
    const wsUrl = `ws://${window.location.hostname}:8000/ws`;

    const connect = () => {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("✅ WebSocket połączony");
          setDroneStatus((prev: any) => ({ ...prev, state: "idle" }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "incident") {
              setIncidents((prev: any[]) => [msg.data, ...prev].slice(0, 50));
              showToast(`🚨 ${msg.data.incident_type}`, msg.data.location);
            } else if (msg.type === "drone_status") {
              setDroneStatus(msg.data);
            }
          } catch (e) {
            console.error("Błąd parsowania WS", e);
          }
        };

        ws.onclose = () => {
          console.log("WebSocket rozłączony, ponawiam za 3s...");
          setTimeout(connect, 3000); // Auto-reconnect
        };
      } catch (e) {
        console.log("WebSocket niedostępny");
      }
    };

    connect();

    // Pobieraj status drona co 3 sekundy
    const droneInterval = setInterval(async () => {
      try {
        const res = await fetch("/drone/status");
        if (res.ok) setDroneStatus(await res.json());
      } catch {}
    }, 3000);

    // Pobieraj incydenty co 5 sekund (fallback gdy WS nie działa)
    const incidentInterval = setInterval(async () => {
      try {
        const res = await fetch("/incidents/");
        if (res.ok) {
          const data = await res.json();
          if (data.incidents?.length > 0) setIncidents(data.incidents);
        }
      } catch {}
    }, 5000);

    return () => {
      wsRef.current?.close();
      clearInterval(droneInterval);
      clearInterval(incidentInterval);
    };
  }, []);

  const showToast = (title: string, msg: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, msg }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const sendCommand = async (cmd: string) => {
    try {
      const res = await fetch(`/drone/${cmd}`, { method: "POST" });
      if (res.ok) showToast("✅ Komenda wyslana", cmd);
    } catch (e) {
      showToast("❌ Błąd", "Nie można połączyć się z dronem");
    }
  };

  return (
    <div className="dashboard-grid">
      
      {/* Pasek boczny */}
      <aside className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck color="#3b82f6" /> SkyGuard EDU
          </h1>
          <p className="text-muted" style={{ marginTop: '5px' }}>Bezpieczna Edukacja</p>
        </div>

        <div>
          <h3 style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Crosshair size={18} /> Dron Status
          </h3>
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span className="text-muted">Stan:</span>
              <span style={{ color: droneStatus.state === 'patrolling' ? 'var(--accent-blue)' : '#fff', fontWeight: 600, textTransform: 'capitalize' }}>
                <span className={`status-indicator ${droneStatus.state === 'offline' ? '' : 'status-online'}`}></span>
                {droneStatus.state || "Offline"}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-muted">Bateria:</span>
              <span style={{ color: (droneStatus.battery_pct || 0) < 20 ? 'var(--accent-red)' : 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Battery size={16} /> {droneStatus.battery_pct ? Math.round(droneStatus.battery_pct) : 0}%
              </span>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '15px' }}>
            <button className="btn btn-outline" onClick={() => sendCommand('takeoff')}>Start</button>
            <button className="btn btn-outline" onClick={() => sendCommand('land')}>Lądowanie</button>
            <button className="btn btn-primary" style={{ gridColumn: '1 / -1' }} onClick={() => sendCommand('patrol/start')}>Rozpocznij Patrol</button>
            <button className="btn btn-danger" style={{ gridColumn: '1 / -1' }} onClick={() => sendCommand('emergency')}>Tryb Awaryjny</button>
          </div>
        </div>
      </aside>

      {/* Główna zawartość */}
      <main className="main-content">
        
        {/* Stream Wideo */}
        <section className="glass-panel">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Video /> Podgląd na żywo</h2>
          <div className="video-wrapper">
            {/* Stream MJPEG przez Next.js proxy (/stream/live → :8000/stream/live) */}
            {!cameraError ? (
              <img
                src="/stream/live"
                alt="Live Stream kamery"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => setCameraError(true)}
              />
            ) : (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#555', flexDirection: 'column', gap: '12px' }}>
                <Video size={48} opacity={0.3} />
                <p>Kamera offline — oczekiwanie na połączenie z dronem</p>
                <button className="btn btn-outline" style={{fontSize:'0.8rem'}} onClick={() => setCameraError(false)}>
                  Spóbuj ponownie
                </button>
              </div>
            )}
            
            {/* Nakładka celownika dekoracyjna */}
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50px', height: '50px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%' }}>
              <div style={{ position: 'absolute', top: '-10px', left: '24px', width: '1px', height: '10px', background: 'rgba(255,255,255,0.5)' }}></div>
              <div style={{ position: 'absolute', bottom: '-10px', left: '24px', width: '1px', height: '10px', background: 'rgba(255,255,255,0.5)' }}></div>
              <div style={{ position: 'absolute', left: '-10px', top: '24px', width: '10px', height: '1px', background: 'rgba(255,255,255,0.5)' }}></div>
              <div style={{ position: 'absolute', right: '-10px', top: '24px', width: '10px', height: '1px', background: 'rgba(255,255,255,0.5)' }}></div>
            </div>
            
            {/* OSD Telemetria */}
            <div style={{ position: 'absolute', bottom: '20px', right: '20px', fontFamily: 'monospace', color: '#0f0', textShadow: '1px 1px 2px #000' }}>
              REC • 1080P 30FPS<br/>
              ALT: {droneStatus.floor || 0}m
            </div>
          </div>
        </section>

        {/* Tabela Incydentów */}
        <section className="glass-panel">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><AlertTriangle color="var(--accent-red)" /> Ostatnie Incydenty</h2>
          
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Czas</th>
                  <th>Typ</th>
                  <th>Lokalizacja</th>
                  <th>Pewność</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {incidents.length > 0 ? incidents.map((inc, i) => (
                  <tr key={inc.id || i}>
                    <td>{new Date(inc.created_at || Date.now()).toLocaleTimeString()}</td>
                    <td><span className="badge badge-red">{inc.incident_type || "Bójka"}</span></td>
                    <td>{inc.location || "Korytarz A"}</td>
                    <td>{Math.round((inc.confidence || 0.85) * 100)}%</td>
                    <td>
                      <button className="btn btn-outline" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}>
                        Zbadaj
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                      <ShieldCheck size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                      Brak wykrytych incydentów. Szkoła jest bezpieczna.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

      </main>

      {/* Toasty (Powiadomienia) */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast">
            <AlertTriangle color="var(--accent-red)" style={{ flexShrink: 0 }} />
            <div>
              <strong style={{ display: 'block', color: 'white', marginBottom: '4px' }}>{t.title}</strong>
              <span className="text-muted" style={{ fontSize: '0.9rem' }}>{t.msg}</span>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
