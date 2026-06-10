"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle, Info, ShieldAlert, Zap, Droplet, Euro } from "lucide-react";
import "../../globals.css";
import "./style.css";

function renderComparison(pct) {
  if (isNaN(pct) || !isFinite(pct) || pct === 0) return <span className="comparison-neutral">— vs periodo anterior</span>;
  const isIncrease = pct > 0;
  const pctStr = Math.abs(pct).toFixed(1) + "%";
  return (
    <span className={`comparison-badge ${isIncrease ? "comparison-red" : "comparison-green"}`}>
      {isIncrease ? <TrendingUp size={14} style={{ marginRight: '4px' }} /> : <TrendingDown size={14} style={{ marginRight: '4px' }} />}
      {pctStr} {isIncrease ? "más" : "menos"} vs periodo anterior
    </span>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartReady, setChartReady] = useState(false);
  const [recommendation, setRecommendation] = useState(null);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [profile, setProfile] = useState(null);
  const router = useRouter();

  useEffect(() => {
    setChartReady(true);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/");
      return;
    }

    const fetchData = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8000/energy/readings/", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!res.ok) {
          if (res.status === 401) {
            localStorage.removeItem("access_token");
            router.push("/");
            return;
          }
          throw new Error("Error al obtener datos");
        }

        const result = await res.json();

        let myHomeResult = result.filter(d => d.home && d.home.name !== "Zonas Comunes");

        if (myHomeResult.length > 0) {
          const firstHomeId = myHomeResult[0].home.id;
          myHomeResult = myHomeResult.filter(d => d.home.id === firstHomeId);
        }

        const formattedData = myHomeResult.map((d) => ({
          ...d,
          fecha_corta: new Date(d.timestamp).toLocaleDateString(),
          timestamp_ms: new Date(d.timestamp).getTime()
        })).sort((a, b) => a.timestamp_ms - b.timestamp_ms);

        const resRec = await fetch("http://127.0.0.1:8000/energy/recommend-tariff/", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (resRec.ok) {
          const recResult = await resRec.json();
          setRecommendation(recResult);
        }

        const resProfile = await fetch("http://127.0.0.1:8000/api/users/profile/", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (resProfile.ok) {
          const profileResult = await resProfile.json();
          setProfile(profileResult);
        }

        const resAlerts = await fetch("http://127.0.0.1:8000/energy/alerts/?status=ACTIVE", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (resAlerts.ok) {
          const alertsResult = await resAlerts.json();
          setActiveAlerts(alertsResult);
        }

        setData(formattedData);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const numDays = useMemo(() => {
    const uniqueDays = new Set(data.map(d => new Date(d.timestamp_ms).toISOString().split('T')[0]));
    return Math.max(uniqueDays.size, 1);
  }, [data]);

  const avgElectricidad = (data.reduce((acc, curr) => acc + curr.electricity_kwh, 0) / numDays).toFixed(2);
  const avgAgua = (data.reduce((acc, curr) => acc + curr.water_m3, 0) / numDays).toFixed(2);

  // Helper para estimar costes 2.0TD
  const computeCost = (periodData, userProfile) => {
    if (periodData.length === 0) return 0;
    const tariffType = userProfile?.current_tariff_type || "PVPC";
    const powerP1 = userProfile?.current_power_p1 !== undefined && userProfile?.current_power_p1 !== null ? Number(userProfile.current_power_p1) : 3.45;
    const powerP2 = userProfile?.current_power_p2 !== undefined && userProfile?.current_power_p2 !== null ? Number(userProfile.current_power_p2) : 3.45;

    const fixedPrice = userProfile?.current_tariff_fixed_price !== undefined && userProfile?.current_tariff_fixed_price !== null
      ? Number(userProfile.current_tariff_fixed_price)
      : 0.12;

    const p1Price = userProfile?.current_tariff_p1_price !== undefined && userProfile?.current_tariff_p1_price !== null
      ? Number(userProfile.current_tariff_p1_price)
      : 0.18;
    const p2Price = userProfile?.current_tariff_p2_price !== undefined && userProfile?.current_tariff_p2_price !== null
      ? Number(userProfile.current_tariff_p2_price)
      : 0.13;
    const p3Price = userProfile?.current_tariff_p3_price !== undefined && userProfile?.current_tariff_p3_price !== null
      ? Number(userProfile.current_tariff_p3_price)
      : 0.09;

    const pvpcP1 = 0.16;
    const pvpcP2 = 0.11;
    const pvpcP3 = 0.07;

    const regP1 = 0.097553;
    const regP2 = 0.029267;
    const regP3 = 0.003292;

    let energyCost = 0;

    periodData.forEach(reading => {
      const kwh = reading.electricity_kwh || 0;
      const date = new Date(reading.timestamp);
      
      let period = "P1";
      const day = date.getDay();
      if (day === 0 || day === 6) {
        period = "P3";
      } else {
        const hour = date.getHours();
        if (hour >= 0 && hour < 8) {
          period = "P3";
        } else if ((hour >= 8 && hour < 10) || (hour >= 14 && hour < 18) || (hour >= 22 && hour < 24)) {
          period = "P2";
        } else {
          period = "P1";
        }
      }

      const regCost = kwh * (period === "P1" ? regP1 : period === "P2" ? regP2 : regP3);

      let supplyCost = 0;
      if (tariffType === "FIXED") {
        supplyCost = kwh * fixedPrice;
      } else if (tariffType === "TOU") {
        supplyCost = kwh * (period === "P1" ? p1Price : period === "P2" ? p2Price : p3Price);
      } else {
        supplyCost = kwh * (period === "P1" ? pvpcP1 : period === "P2" ? pvpcP2 : pvpcP3);
      }

      energyCost += regCost + supplyCost;
    });

    const uniqueDays = new Set(periodData.map(d => new Date(d.timestamp_ms).toISOString().split('T')[0]));
    const days = Math.max(uniqueDays.size, 1);

    const p1Day = 27.704413 / 365.0;
    const p2Day = 0.725423 / 365.0;
    const powerCost = days * (powerP1 * p1Day + powerP2 * p2Day);

    const meterRentalCost = days * 0.0266;

    return energyCost + powerCost + meterRentalCost;
  };

  // Segmentar lecturas en periodos (Últimos 30 días vs 30 días anteriores)
  const periodMetrics = useMemo(() => {
    if (data.length === 0) return null;

    const maxDate = data[data.length - 1].timestamp_ms;
    const currentPeriodStart = maxDate - (30 * 24 * 60 * 60 * 1000);
    const previousPeriodStart = maxDate - (60 * 24 * 60 * 60 * 1000);

    const currentPeriodData = data.filter(d => d.timestamp_ms >= currentPeriodStart && d.timestamp_ms <= maxDate);
    const previousPeriodData = data.filter(d => d.timestamp_ms >= previousPeriodStart && d.timestamp_ms < currentPeriodStart);

    const getDays = (pData) => {
      const uniqueDays = new Set(pData.map(d => new Date(d.timestamp_ms).toISOString().split('T')[0]));
      return Math.max(uniqueDays.size, 1);
    };

    const daysCurr = getDays(currentPeriodData);
    const daysPrev = getDays(previousPeriodData);

    const elecCurr = currentPeriodData.reduce((acc, curr) => acc + curr.electricity_kwh, 0) / daysCurr;
    const elecPrev = previousPeriodData.length > 0
      ? previousPeriodData.reduce((acc, curr) => acc + curr.electricity_kwh, 0) / daysPrev
      : 0;
    const elecPct = elecPrev > 0 ? ((elecCurr - elecPrev) / elecPrev) * 100 : 0;

    const waterCurr = currentPeriodData.reduce((acc, curr) => acc + curr.water_m3, 0) / daysCurr;
    const waterPrev = previousPeriodData.length > 0
      ? previousPeriodData.reduce((acc, curr) => acc + curr.water_m3, 0) / daysPrev
      : 0;
    const waterPct = waterPrev > 0 ? ((waterCurr - waterPrev) / waterPrev) * 100 : 0;

    const costCurr = computeCost(currentPeriodData, profile);
    const costPrev = computeCost(previousPeriodData, profile);
    const costPct = costPrev > 0 ? ((costCurr - costPrev) / costPrev) * 100 : 0;

    return {
      elecCurrent: elecCurr,
      elecPrevious: elecPrev,
      elecPercentage: elecPct,

      waterCurrent: waterCurr,
      waterPrevious: waterPrev,
      waterPercentage: waterPct,

      costCurrent: costCurr,
      costPrevious: costPrev,
      costPercentage: costPct,
    };
  }, [data, profile]);

  // Generar Insights del Resumen Ejecutivo
  const executiveInsights = useMemo(() => {
    if (!periodMetrics) return [];
    const insights = [];

    // 1. Tendencia consumo eléctrico
    const elecChange = periodMetrics.elecPercentage;
    if (elecChange > 2) {
      insights.push({
        type: "warning",
        label: "Consumo eléctrico",
        text: `Este mes consumes un ${elecChange.toFixed(0)}% MÁS de electricidad que el periodo anterior.`
      });
    } else if (elecChange < -2) {
      insights.push({
        type: "success",
        label: "Eficiencia",
        text: `¡Buen trabajo! Este mes consumes un ${Math.abs(elecChange).toFixed(0)}% MENOS de electricidad.`
      });
    } else {
      insights.push({
        type: "info",
        label: "Consumo eléctrico",
        text: "Tu consumo eléctrico diario se mantiene estable respecto al mes anterior."
      });
    }

    // 2. Tarifa óptima recomendada
    if (recommendation && recommendation.rankings && recommendation.rankings.length > 0) {
      const best = recommendation.rankings[0];
      insights.push({
        type: "success",
        label: "Tarifa óptima",
        text: `Tu tarifa óptima estimada es ${best.tarifa} con potencia ${best.potencia_p1_kw} / ${best.potencia_p2_kw} kW.`,
        link: "/tarifas"
      });
    }

    // 3. Avisos activos
    if (activeAlerts.length > 0) {
      insights.push({
        type: "warning",
        label: "Avisos activos",
        text: `Tienes ${activeAlerts.length} aviso(s) activo(s) en tu bandeja de notificaciones.`,
        link: "/avisos"
      });
    } else {
      insights.push({
        type: "success",
        label: "Estado general",
        text: "No se registran anomalías ni excesos de consumo recientes en tu hogar.",
        link: "/avisos"
      });
    }

    // 4. Consumo nocturno anómalo
    const nightAlert = activeAlerts.find(a => a.alert_type === "HIGH_NIGHT_USAGE");
    if (nightAlert) {
      insights.push({
        type: "danger",
        label: "Consumo nocturno",
        text: "¡Atención! Tu consumo nocturno reciente está por encima de tu patrón habitual.",
        link: "/avisos"
      });
    }

    return insights;
  }, [periodMetrics, recommendation, activeAlerts]);

  const nombrePiso = data.length > 0 && data[0].home ? data[0].home.name : "tu vivienda";

  return (
    <div className="container dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Panel de Control Energético</h1>
          <p className="dashboard-subtitle">
            Bienvenido a los consumos de <strong>{nombrePiso}</strong>
          </p>
        </div>
      </header>

      {loading ? (
        <div className="loading-message">Cargando tus datos energéticos...</div>
      ) : data.length === 0 ? (
        <div className="card text-center">No hay datos registrados para tu vivienda.</div>
      ) : (
        <>
          {/* Diagnóstico Rápido / Resumen Ejecutivo */}
          {executiveInsights.length > 0 && (
            <section style={{ marginBottom: "2rem" }}>
              <h2 className="section-title" style={{ fontSize: "1.1rem", marginBottom: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Diagnóstico Rápido
              </h2>
              <div className="diagnostic-grid">
                {executiveInsights.map((insight, idx) => {
                  const iconColor = insight.type === "success" ? "#2e7d32" : insight.type === "warning" ? "#ff9800" : insight.type === "danger" ? "#ef4444" : "#2196f3";
                  const bgColor = insight.type === "success" ? "rgba(46, 125, 50, 0.08)" : insight.type === "warning" ? "rgba(255, 152, 0, 0.08)" : insight.type === "danger" ? "rgba(239, 68, 68, 0.08)" : "rgba(33, 150, 243, 0.08)";
                  const isClickable = !!insight.link;
                  return (
                    <div 
                      key={idx} 
                      className="diagnostic-card"
                      style={isClickable ? { cursor: "pointer" } : {}}
                      onClick={isClickable ? () => router.push(insight.link) : undefined}
                    >
                      <div className="diagnostic-icon-wrapper" style={{ backgroundColor: bgColor }}>
                        {insight.type === "success" && <CheckCircle size={22} color={iconColor} />}
                        {insight.type === "warning" && <AlertCircle size={22} color={iconColor} />}
                        {insight.type === "danger" && <ShieldAlert size={22} color={iconColor} />}
                        {insight.type === "info" && <Info size={22} color={iconColor} />}
                      </div>
                      <div className="diagnostic-content">
                        <div className="diagnostic-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>{insight.label}</span>
                          {isClickable && <span style={{ fontSize: "0.7rem", opacity: 0.5 }}>➔</span>}
                        </div>
                        <p className="diagnostic-text">{insight.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Grilla de KPIs principales */}
          <div className="kpi-grid">
            <div className="diagnostic-card">
              <div className="diagnostic-icon-wrapper" style={{ backgroundColor: "rgba(255, 152, 0, 0.08)" }}>
                <Zap size={22} color="#FF9800" />
              </div>
              <div className="diagnostic-content">
                <div className="diagnostic-label">Consumo Eléctrico Diario</div>
                <p className="diagnostic-text" style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#FF9800", margin: "2px 0" }}>
                  {periodMetrics ? periodMetrics.elecCurrent.toFixed(2) : avgElectricidad} <span style={{ fontSize: "0.85rem", fontWeight: "normal", color: "var(--text-muted)" }}>kWh/día</span>
                </p>
                {periodMetrics && (
                  <div className="comparison-container" style={{ marginTop: "2px" }}>
                    {renderComparison(periodMetrics.elecPercentage)}
                  </div>
                )}
              </div>
            </div>

            <div className="diagnostic-card">
              <div className="diagnostic-icon-wrapper" style={{ backgroundColor: "rgba(0, 188, 212, 0.08)" }}>
                <Droplet size={22} color="#00BCD4" />
              </div>
              <div className="diagnostic-content">
                <div className="diagnostic-label">Consumo ACS Diario</div>
                <p className="diagnostic-text" style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#00BCD4", margin: "2px 0" }}>
                  {periodMetrics ? periodMetrics.waterCurrent.toFixed(2) : avgAgua} <span style={{ fontSize: "0.85rem", fontWeight: "normal", color: "var(--text-muted)" }}>m³/día</span>
                </p>
                {periodMetrics && (
                  <div className="comparison-container" style={{ marginTop: "2px" }}>
                    {renderComparison(periodMetrics.waterPercentage)}
                  </div>
                )}
              </div>
            </div>

            <div className="diagnostic-card">
              <div className="diagnostic-icon-wrapper" style={{ backgroundColor: "rgba(245, 158, 11, 0.08)" }}>
                <Euro size={22} color="#f59e0b" />
              </div>
              <div className="diagnostic-content">
                <div className="diagnostic-label">Coste Estimado (30d)</div>
                {periodMetrics ? (
                  <>
                    <p className="diagnostic-text" style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#f59e0b", margin: "2px 0" }}>
                      {periodMetrics.costCurrent.toFixed(2)} <span style={{ fontSize: "0.85rem", fontWeight: "normal", color: "var(--text-muted)" }}>€</span>
                    </p>
                    <div className="comparison-container" style={{ marginTop: "2px" }}>
                      {renderComparison(periodMetrics.costPercentage)}
                    </div>
                  </>
                ) : (
                  <p className="diagnostic-text" style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#f59e0b", margin: "2px 0" }}>
                    — <span style={{ fontSize: "0.85rem", fontWeight: "normal", color: "var(--text-muted)" }}>€</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="card chart-card">
            <h2 className="chart-title">Evolución de Consumo Histórico</h2>

            <div className="chart-shell">
              {chartReady && (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="fecha_corta" minTickGap={50} />
                    <YAxis
                      yAxisId="left"
                      label={{
                        value: "kWh (Electr)",
                        angle: -90,
                        position: "insideLeft",
                        offset: -5
                      }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      label={{
                        value: "m³ (Agua)",
                        angle: 90,
                        position: "insideRight",
                        offset: 5
                      }}
                    />
                    <Tooltip />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="electricity_kwh"
                      name="Electricidad"
                      stroke="#FF9800"
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line
                      yAxisId="right"
                      type="step"
                      dataKey="water_m3"
                      name="Agua Caliente (ACS)"
                      stroke="#00BCD4"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}