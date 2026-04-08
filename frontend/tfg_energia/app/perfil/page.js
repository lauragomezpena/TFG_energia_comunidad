"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "../globals.css";

export default function PerfilPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Estados Formulario Email
  const [email, setEmail] = useState("");
  const [emailMessage, setEmailMessage] = useState({ text: "", type: "" });

  // Estados Formulario Contraseña
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState({ text: "", type: "" });

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
        setData(result);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    setEmailMessage({ text: "", type: "" });

    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch("http://127.0.0.1:8000/api/users/update-email/", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.email ? errData.email[0] : "No se pudo actualizar el email.");
      }

      setEmailMessage({ text: "Tu email se ha actualizado correctamente.", type: "success" });
    } catch (err) {
      setEmailMessage({ text: err.message, type: "error" });
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setPasswordMessage({ text: "", type: "" });

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ text: "Las nuevas contraseñas no coinciden.", type: "error" });
      return;
    }

    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch("http://127.0.0.1:8000/api/users/change-password/", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.old_password ? errData.old_password[0] : "Ocurrió un error al cambiar la contraseña.");
      }

      setPasswordMessage({ text: "Tu contraseña ha sido actualizada con éxito. Cierra sesión para probarla.", type: "success" });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordMessage({ text: err.message, type: "error" });
    }
  };

  // Cálculo: Total de los últimos 30 días registrados
  let consumo30dElectricidad = 0;
  let consumo30dAgua = 0;
  let hasData = data.length > 0;
  
  if (hasData) {
    // 1. Encontrar cuál es la fecha máxima disponible en el dataset
    // (Asumimos data está ordenada o iteramos)
    const sortedData = [...data].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const lastDateVal = new Date(sortedData[0].timestamp).getTime();
    
    // 2. La barrera mínima es (ultimaFecha - 30 días)
    const barrierDate = lastDateVal - (30 * 24 * 60 * 60 * 1000);

    // 3. Sumar solo lo que está por delante de la barrera mínima
    const filtered30d = data.filter((d) => new Date(d.timestamp).getTime() >= barrierDate);
    
    consumo30dElectricidad = filtered30d.reduce((acc, curr) => acc + curr.electricity_kwh, 0).toFixed(2);
    consumo30dAgua = filtered30d.reduce((acc, curr) => acc + curr.water_m3, 0).toFixed(2);
  }

  return (
    <div className="container" style={{ padding: '2rem 1rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ color: 'var(--primary-dark)' }}>Mi Perfil</h1>
          <p style={{ color: 'var(--text-muted)' }}>Configura tu cuenta y revisa el resumen del mes</p>
        </div>
        <button 
          className="btn-primary" 
          style={{ backgroundColor: 'var(--text-muted)' }}
          onClick={() => router.push("/dashboard")}
        >
          Volver al Dashboard
        </button>
      </header>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>Cargando datos...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
          
          {/* Bloque Izquierdo: Resumen del Último Mes Registrado */}
          <div className="card" style={{ height: 'fit-content' }}>
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.5rem' }}>
              Los Últimos 30 Días
            </h2>
            {hasData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                  <h3 style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Consumo Eléctrico 30D</h3>
                  <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary-blue)' }}>{consumo30dElectricidad} <span style={{ fontSize: '1rem' }}>kWh</span></p>
                </div>
                <div>
                  <h3 style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Consumo de ACS 30D</h3>
                  <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent-green)' }}>{consumo30dAgua} <span style={{ fontSize: '1rem' }}>m³</span></p>
                </div>
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f0f9ff', borderRadius: '8px', borderLeft: '4px solid var(--primary-blue)' }}>
                  <p style={{ fontSize: '0.9rem', margin: 0, color: '#0369a1' }}>
                    <strong>Insight inteligente:</strong> Los totales del último mes móvil son representativos para poder simular estimaciones de coste. Si vinculas un e-mail real en la sección contigua, podremos enviarte estos resúmenes mes a mes.
                  </p>
                </div>
              </div>
            ) : (
              <p>No tienes consumos registrados todavía.</p>
            )}
          </div>

          {/* Bloque Derecho: Formularios de Usuario */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* Email Form */}
            <div className="card">
              <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Vincular Correo Electrónico</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Añade el correo al que quieres que te lleguen las notificaciones, alertas de sobreconsumo o estimaciones del modelo de IA.
              </p>
              <form onSubmit={handleUpdateEmail} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {emailMessage.text && (
                  <div style={{ padding: '0.75rem', borderRadius: '6px', backgroundColor: emailMessage.type === 'error' ? '#fee2e2' : '#dcfce3', color: emailMessage.type === 'error' ? '#991b1b' : '#166534', fontSize: '0.9rem' }}>
                    {emailMessage.text}
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Correo Electrónico (Tu Email)</label>
                  <input
                    type="email"
                    className="input-field"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tucorreo@ejemplo.com"
                    required
                  />
                </div>
                <button type="submit" className="btn-primary">Asociar Email</button>
              </form>
            </div>

            {/* Password Form */}
            <div className="card">
              <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Cambiar Contraseña</h2>
              <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {passwordMessage.text && (
                  <div style={{ padding: '0.75rem', borderRadius: '6px', backgroundColor: passwordMessage.type === 'error' ? '#fee2e2' : '#dcfce3', color: passwordMessage.type === 'error' ? '#991b1b' : '#166534', fontSize: '0.9rem' }}>
                    {passwordMessage.text}
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Contraseña actual</label>
                  <input
                    type="password"
                    className="input-field"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Nueva contraseña</label>
                  <input
                    type="password"
                    className="input-field"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Confirmar nueva contraseña</label>
                  <input
                    type="password"
                    className="input-field"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn-primary" style={{ backgroundColor: 'var(--primary-dark)' }}>Actualizar Seguridad</button>
              </form>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
