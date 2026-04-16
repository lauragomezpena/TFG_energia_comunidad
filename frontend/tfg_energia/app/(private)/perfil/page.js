"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "../../globals.css";
import "./style.css";

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
        throw new Error(
          errData.old_password
            ? errData.old_password[0]
            : "Ocurrió un error al cambiar la contraseña."
        );
      }

      setPasswordMessage({
        text: "Tu contraseña ha sido actualizada con éxito. Cierra sesión para probarla.",
        type: "success"
      });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordMessage({ text: err.message, type: "error" });
    }
  };

  let consumo30dElectricidad = 0;
  let consumo30dAgua = 0;
  const hasData = data.length > 0;

  if (hasData) {
    const sortedData = [...data].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );
    const lastDateVal = new Date(sortedData[0].timestamp).getTime();
    const barrierDate = lastDateVal - (30 * 24 * 60 * 60 * 1000);

    const filtered30d = data.filter(
      (d) => new Date(d.timestamp).getTime() >= barrierDate
    );

    consumo30dElectricidad = filtered30d
      .reduce((acc, curr) => acc + curr.electricity_kwh, 0)
      .toFixed(2);

    consumo30dAgua = filtered30d
      .reduce((acc, curr) => acc + curr.water_m3, 0)
      .toFixed(2);
  }

  return (
    <div className="container perfil-page">
      <header className="perfil-header">
        <div>
          <h1 className="perfil-title">Mi Perfil</h1>
          <p className="perfil-subtitle">
            Configura tu cuenta y revisa el resumen del mes
          </p>
        </div>
      </header>

      {loading ? (
        <div className="loading-message">Cargando datos...</div>
      ) : (
        <div className="perfil-grid">
         

          <div className="forms-column">
            <div className="card">
              <h2 className="form-title">Vincular Correo Electrónico</h2>
              <p className="form-description">
                Añade el correo al que quieres que te lleguen las notificaciones,
                alertas de sobreconsumo o estimaciones del modelo de IA.
              </p>

              <form onSubmit={handleUpdateEmail} className="form-layout">
                {emailMessage.text && (
                  <div
                    className={`message-box ${
                      emailMessage.type === "error" ? "message-error" : "message-success"
                    }`}
                  >
                    {emailMessage.text}
                  </div>
                )}

                <div>
                  <label className="form-label">
                    Correo Electrónico (Tu Email)
                  </label>
                  <input
                    type="email"
                    className="input-field"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tucorreo@ejemplo.com"
                    required
                  />
                </div>

                <button type="submit" className="btn-primary">
                  Asociar Email
                </button>
              </form>
            </div>

            <div className="card">
              <h2 className="form-title">Cambiar Contraseña</h2>

              <form onSubmit={handleUpdatePassword} className="form-layout">
                {passwordMessage.text && (
                  <div
                    className={`message-box ${
                      passwordMessage.type === "error"
                        ? "message-error"
                        : "message-success"
                    }`}
                  >
                    {passwordMessage.text}
                  </div>
                )}

                <div>
                  <label className="form-label">Contraseña actual</label>
                  <input
                    type="password"
                    className="input-field"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="form-label">Nueva contraseña</label>
                  <input
                    type="password"
                    className="input-field"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="form-label">Confirmar nueva contraseña</label>
                  <input
                    type="password"
                    className="input-field"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary security-btn"
                >
                  Actualizar Seguridad
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}