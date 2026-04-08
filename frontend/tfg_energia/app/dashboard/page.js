"use client";

import { useEffect, useState } from "react";
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
import "../globals.css";

export default function DashboardPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/");
      return;
    }

    const fetchData = async () => {
      try {
        const res = await fetch("http://localhost:8000/energy/readings/", {
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
        
        // Formateamos la fecha para que sea más legible en Recharts
        const formattedData = result.map(d => ({
          ...d,
          fecha_corta: new Date(d.timestamp).toLocaleDateString()
        }));

        setData(formattedData);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  // Cálculos resumen (KPIs)
  const totalAgua = data.reduce((acc, curr) => acc + curr.water_m3, 0).toFixed(2);
  const totalElectricidad = data.reduce((acc, curr) => acc + curr.electricity_kwh, 0).toFixed(2);

  return (
    <div className="container" style={{ padding: '2rem 1rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ color: 'var(--primary-dark)' }}>Panel de Control Energético</h1>
          <p style={{ color: 'var(--text-muted)' }}>Bienvenido a tus consumos personalizados</p>
        </div>
        <button 
          className="btn-primary" 
          style={{ backgroundColor: '#ef4444' }}
          onClick={() => {
            localStorage.clear();
            router.push("/");
          }}
        >
          Cerrar Sesión
        </button>
      </header>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>Cargando tus datos energéticos...</div>
      ) : data.length === 0 ? (
        <div className="card text-center">No hay datos registrados para tu vivienda.</div>
      ) : (
        <>
          {/* Tarjetas KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <div className="card">
              <h3 style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Consumo Eléctrico Total</h3>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary-blue)' }}>{totalElectricidad} <span style={{ fontSize: '1rem' }}>kWh</span></p>
            </div>
            <div className="card">
              <h3 style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Consumo de ACS Total</h3>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent-green)' }}>{totalAgua} <span style={{ fontSize: '1rem' }}>m³</span></p>
            </div>
            <div className="card">
              <h3 style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Est. Coste Acumulado</h3>
              {/* En la base de datos es 0 por ahora, mostramos 0 o un placeholder */}
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>0.00 <span style={{ fontSize: '1rem' }}>€</span></p>
            </div>
          </div>

          {/* Gráfico principal */}
          <div className="card" style={{ height: '400px', marginBottom: '2rem' }}>
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>Evolución de Consumo Histórico</h2>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="fecha_corta" minTickGap={50} />
                <YAxis yAxisId="left" label={{ value: 'kWh (Electr)', angle: -90, position: 'insideLeft' }} />
                <YAxis yAxisId="right" orientation="right" label={{ value: 'm³ (Agua)', angle: 90, position: 'insideRight' }} />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="electricity_kwh" name="Electricidad" stroke="var(--primary-blue)" dot={false} strokeWidth={2} />
                <Line yAxisId="right" type="step" dataKey="water_m3" name="Agua Caliente (ACS)" stroke="var(--accent-green)" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
