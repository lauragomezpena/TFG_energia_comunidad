"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, Info, Zap, Moon, BatteryWarning, TrendingDown, Clock, Check } from "lucide-react";
import "../../globals.css";

// Formateador de fechas
function formatDateTime(isoStr) {
  if (!isoStr) return "N/A";
  const d = new Date(isoStr);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AvisosPage() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("ACTIVE"); // ACTIVE, RESOLVED, ALL
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetchAlerts();
  }, [filterStatus]);

  const fetchAlerts = async () => {
    const token = localStorage.getItem("access_token");
    if (!token) { router.push("/"); return; }

    setLoading(true);
    try {
      let url = "http://127.0.0.1:8000/energy/alerts/";
      if (filterStatus !== "ALL") {
        url += `?status=${filterStatus}`;
      }
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        localStorage.removeItem("access_token");
        router.push("/");
        return;
      }
      const data = await res.json();
      
      // Ordenar para que TARIFF_SAVING aparezca siempre primero
      const sortedData = data.sort((a, b) => {
        if (a.alert_type === 'TARIFF_SAVING' && b.alert_type !== 'TARIFF_SAVING') return -1;
        if (b.alert_type === 'TARIFF_SAVING' && a.alert_type !== 'TARIFF_SAVING') return 1;
        return 0; // Mantener orden de la base de datos (por fecha) para el resto
      });
      
      setAlerts(sortedData);
    } catch (err) {
      setErrorMsg("Error al cargar los avisos.");
    } finally {
      setLoading(false);
    }
  };

  const updateAlert = async (id, payload) => {
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`http://127.0.0.1:8000/energy/alerts/${id}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        // Refrescar lista localmente
        fetchAlerts();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getSeverityColor = (severity) => {
    switch(severity) {
      case 'HIGH': return '#ff1744'; // Rojo intenso
      case 'MEDIUM': return '#ff9800'; // Naranja
      case 'LOW': return '#2196f3'; // Azul
      default: return '#757575';
    }
  };

  const getIconForType = (type, severity) => {
    const color = getSeverityColor(severity);
    switch(type) {
      case 'HIGH_NIGHT_USAGE': return <Moon size={24} color={color} />;
      case 'HIGH_USAGE': return <TrendingDown style={{transform: "rotate(180deg)"}} size={24} color={color} />;
      case 'ANOMALOUS_PEAK': return <Zap size={24} color={color} />;
      case 'HIGH_STANDBY': return <BatteryWarning size={24} color={color} />;
      case 'TARIFF_SAVING': return <TrendingDown size={24} color={color} />;
      default: return <AlertCircle size={24} color={color} />;
    }
  };

  return (
    <div className="container perfil-page">
      <header className="perfil-header" style={{ marginBottom: "1rem" }}>
        <div>
          <h1 className="perfil-title">Bandeja de Avisos</h1>
          <p className="perfil-subtitle">Notificaciones automáticas sobre el comportamiento energético de tu vivienda.</p>
        </div>
      </header>

      {errorMsg && <p style={{ color: "red" }}>{errorMsg}</p>}

      {loading ? (
        <div className="loading-message">Cargando avisos...</div>
      ) : alerts.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--text-muted)" }}>
          <CheckCircle size={48} style={{ margin: "0 auto", marginBottom: "1rem", color: "var(--accent-green)" }} />
          <h3>No tienes avisos en esta categoría</h3>
          <p>Tu vivienda no presenta anomalías recientes.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {alerts.map(alert => (
            <div 
              key={alert.id} 
              className="card" 
              style={{ 
                display: "flex", 
                gap: "1.5rem", 
                alignItems: "flex-start",
                borderLeft: `4px solid ${getSeverityColor(alert.severity)}`,
                opacity: alert.status === "RESOLVED" ? 0.6 : 1
              }}
            >
              <div style={{ padding: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "12px" }}>
                {getIconForType(alert.alert_type, alert.severity)}
              </div>
              
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <h3 style={{ margin: 0, fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "8px" }}>
                    {alert.title}
                    {!alert.is_read && alert.status === "ACTIVE" && (
                      <span style={{ background: "#ff1744", width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" }}></span>
                    )}
                  </h3>
                </div>
                
                {(alert.start_period || alert.end_period) && (
                  <div style={{ fontSize: "0.85rem", color: "var(--primary-blue)", marginBottom: "8px", fontWeight: "500" }}>
                    📅 Periodo: {alert.start_period ? formatDateTime(alert.start_period) : ''} 
                    {alert.end_period && alert.end_period !== alert.start_period ? ` - ${formatDateTime(alert.end_period)}` : ''}
                  </div>
                )}
                
                <p style={{ color: "var(--text-color)", margin: "8px 0", lineHeight: "1.5" }}>
                  {alert.message}
                </p>
                
                {/* Detalles Analíticos */}
                {(alert.observed_value !== null && alert.reference_value !== null) && (
                  <div style={{ display: "flex", gap: "1.5rem", marginTop: "12px", fontSize: "0.9rem", color: "var(--text-muted)" }}>
                    <div>
                      <strong>Valor observado:</strong> {alert.observed_value.toFixed(2)}
                    </div>
                    <div>
                      <strong>Referencia histórica:</strong> {alert.reference_value.toFixed(2)}
                    </div>
                  </div>
                )}
                
                {/* Metadatos (Ej: Ahorro de tarifa) */}
                {alert.metadata && alert.metadata.savings_eur && (
                  <div style={{ marginTop: "8px", color: "var(--accent-green)", fontWeight: "bold" }}>
                    💰 Ahorro potencial: {alert.metadata.savings_eur.toFixed(2)} €/año
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
