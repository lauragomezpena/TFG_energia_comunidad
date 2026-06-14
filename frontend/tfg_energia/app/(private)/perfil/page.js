"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "../../api";
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

  // Estados Formulario Tarifa y Potencia
  const [currentTariffType, setCurrentTariffType] = useState("PVPC");
  const [currentTariffFixedPrice, setCurrentTariffFixedPrice] = useState("");
  const [currentTariffP1Price, setCurrentTariffP1Price] = useState("");
  const [currentTariffP2Price, setCurrentTariffP2Price] = useState("");
  const [currentTariffP3Price, setCurrentTariffP3Price] = useState("");
  const [currentPowerP1, setCurrentPowerP1] = useState("3.45");
  const [currentPowerP2, setCurrentPowerP2] = useState("3.45");
  const [tariffMessage, setTariffMessage] = useState({ text: "", type: "" });

  // Estados Carga de Factura
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState({ text: "", type: "" });

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/");
      return;
    }

    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/energy/readings/`, {
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

    const fetchProfile = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/users/profile/`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (res.ok) {
          const profile = await res.json();
          setEmail(profile.email || "");
          setCurrentTariffType(profile.current_tariff_type || "PVPC");
          setCurrentTariffFixedPrice(profile.current_tariff_fixed_price !== null ? profile.current_tariff_fixed_price.toString() : "");
          setCurrentTariffP1Price(profile.current_tariff_p1_price !== null ? profile.current_tariff_p1_price.toString() : "");
          setCurrentTariffP2Price(profile.current_tariff_p2_price !== null ? profile.current_tariff_p2_price.toString() : "");
          setCurrentTariffP3Price(profile.current_tariff_p3_price !== null ? profile.current_tariff_p3_price.toString() : "");
          setCurrentPowerP1(profile.current_power_p1 !== null ? profile.current_power_p1.toString() : "3.45");
          setCurrentPowerP2(profile.current_power_p2 !== null ? profile.current_power_p2.toString() : "3.45");
        }
      } catch (err) {
        console.error("Error al obtener el perfil:", err);
      }
    };

    fetchData();
    fetchProfile();
  }, [router]);

  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    setEmailMessage({ text: "", type: "" });

    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_BASE_URL}/api/users/update-email/`, {
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
      const res = await fetch(`${API_BASE_URL}/api/users/change-password/`, {
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

  const handleUpdateTariff = async (e) => {
    e.preventDefault();
    setTariffMessage({ text: "", type: "" });

    const payload = {
      current_tariff_type: currentTariffType,
      current_power_p1: parseFloat(currentPowerP1) || 0,
      current_power_p2: parseFloat(currentPowerP2) || 0,
    };

    if (currentTariffType === "FIXED") {
      payload.current_tariff_fixed_price = currentTariffFixedPrice !== "" ? parseFloat(currentTariffFixedPrice) : null;
      payload.current_tariff_p1_price = null;
      payload.current_tariff_p2_price = null;
      payload.current_tariff_p3_price = null;
    } else if (currentTariffType === "TOU") {
      payload.current_tariff_fixed_price = null;
      payload.current_tariff_p1_price = currentTariffP1Price !== "" ? parseFloat(currentTariffP1Price) : null;
      payload.current_tariff_p2_price = currentTariffP2Price !== "" ? parseFloat(currentTariffP2Price) : null;
      payload.current_tariff_p3_price = currentTariffP3Price !== "" ? parseFloat(currentTariffP3Price) : null;
    } else {
      payload.current_tariff_fixed_price = null;
      payload.current_tariff_p1_price = null;
      payload.current_tariff_p2_price = null;
      payload.current_tariff_p3_price = null;
    }

    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_BASE_URL}/api/users/profile/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("No se pudo actualizar la configuración de tarifa.");
      }

      setTariffMessage({ text: "Tu configuración de tarifa se ha guardado correctamente.", type: "success" });
    } catch (err) {
      setTariffMessage({ text: err.message, type: "error" });
    }
  };

  const handleUploadInvoice = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadMessage({ text: "", type: "" });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_BASE_URL}/energy/upload-invoice/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errData = await res.json();
          throw new Error(errData.error || "Error al analizar la factura.");
        } else {
          throw new Error(`Error del servidor (${res.status}): ${res.statusText}`);
        }
      }

      const data = await res.json();
      
      // Auto-rellenar el formulario con los datos extraídos
      setCurrentTariffType(data.tariff_type || "PVPC");
      setCurrentTariffFixedPrice(data.fixed_price !== null ? data.fixed_price.toString() : "");
      setCurrentTariffP1Price(data.p1_price !== null ? data.p1_price.toString() : "");
      setCurrentTariffP2Price(data.p2_price !== null ? data.p2_price.toString() : "");
      setCurrentTariffP3Price(data.p3_price !== null ? data.p3_price.toString() : "");
      setCurrentPowerP1(data.power_p1 !== null ? data.power_p1.toString() : "3.45");
      setCurrentPowerP2(data.power_p2 !== null ? data.power_p2.toString() : "3.45");

      setUploadMessage({
        text: "¡Factura leída con éxito! Hemos autorellenado los campos de abajo. Por favor, revísalos y haz clic en 'Guardar Tarifa' para confirmar.",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      setUploadMessage({ text: err.message, type: "error" });
    } finally {
      setUploading(false);
      // Reset input para permitir volver a cargar el mismo archivo
      e.target.value = "";
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
            Configura tu cuenta
          </p>
        </div>
        {!loading && (
          <div className="card summary-header-card">
            <div className="summary-header-item">
              <span className="metric-label">Consumo Eléctrico (30d)</span>
              <div className="metric-value electricity-value compact">
                {consumo30dElectricidad} <span className="metric-unit">kWh</span>
              </div>
            </div>
            <div className="summary-header-item">
              <span className="metric-label">Consumo de Agua (30d)</span>
              <div className="metric-value water-value compact">
                {consumo30dAgua} <span className="metric-unit">m³</span>
              </div>
            </div>
          </div>
        )}
      </header>

      {loading ? (
        <div className="loading-message">Cargando datos...</div>
      ) : (
        <div className="perfil-grid">
          <div className="forms-column">
            <div className="card">
              <h2 className="form-title">Configuración de Tarifa y Potencia</h2>
              <p className="form-description">
                Introduce los detalles de tu tarifa eléctrica actual contratada. 
                Esto permitirá realizar comparaciones reales con el resto de opciones disponibles.
              </p>

              <div
                style={{
                  background: "rgba(30,136,229,0.04)",
                  border: "2px dashed rgba(30,136,229,0.3)",
                  borderRadius: "12px",
                  padding: "1.5rem",
                  textAlign: "center",
                  marginBottom: "1.5rem",
                  position: "relative",
                  transition: "all 0.2s"
                }}
              >
                <div style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>📄</div>
                <h4 style={{ margin: "0 0 0.25rem 0", color: "var(--primary-dark)", fontSize: "1rem" }}>Cargar factura de luz</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 1rem 0" }}>
                  Sube tu factura en formato PDF para rellenar los datos automáticamente con IA.
                </p>
                
                <input
                  type="file"
                  id="invoice-upload"
                  accept="application/pdf"
                  onChange={handleUploadInvoice}
                  style={{ display: "none" }}
                  disabled={uploading}
                />
                
                <label
                  htmlFor="invoice-upload"
                  className="btn-primary"
                  style={{
                    display: "inline-block",
                    cursor: uploading ? "not-allowed" : "pointer",
                    padding: "8px 16px",
                    fontSize: "0.85rem",
                    backgroundColor: uploading ? "#9ca3af" : "var(--primary-blue)",
                    borderRadius: "8px",
                    color: "white",
                    fontWeight: "500"
                  }}
                >
                  {uploading ? "Procesando factura..." : "Seleccionar Archivo"}
                </label>

                {uploadMessage.text && (
                  <div
                    style={{
                      marginTop: "1rem",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      fontSize: "0.85rem",
                      backgroundColor: uploadMessage.type === "success" ? "#dcfce3" : "#fee2e2",
                      color: uploadMessage.type === "success" ? "#15803d" : "#b91c1c",
                      border: uploadMessage.type === "success" ? "1px solid #bbf7d0" : "1px solid #fecaca"
                    }}
                  >
                    {uploadMessage.text}
                  </div>
                )}
              </div>

              <form onSubmit={handleUpdateTariff} className="form-layout">
                {tariffMessage.text && (
                  <div
                    className={`message-box ${
                      tariffMessage.type === "error" ? "message-error" : "message-success"
                    }`}
                  >
                    {tariffMessage.text}
                  </div>
                )}

                <div>
                  <label className="form-label">Tipo de Tarifa</label>
                  <select
                    className="input-field select-field"
                    value={currentTariffType}
                    onChange={(e) => setCurrentTariffType(e.target.value)}
                  >
                    <option value="PVPC">PVPC (Mercado Regulado)</option>
                    <option value="FIXED">Mercado Libre (Precio Fijo Único)</option>
                    <option value="TOU">Mercado Libre (3 Periodos - Discriminación Horaria)</option>
                  </select>
                </div>

                {currentTariffType === "FIXED" && (
                  <div>
                    <label className="form-label">Precio Energía Fijo (€/kWh)</label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      className="input-field"
                      value={currentTariffFixedPrice}
                      onChange={(e) => setCurrentTariffFixedPrice(e.target.value)}
                      placeholder="Ej: 0.13"
                      required
                    />
                  </div>
                )}

                {currentTariffType === "TOU" && (
                  <div className="tariff-grid-3">
                    <div>
                      <label className="form-label">Precio Punta P1 (€/kWh)</label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        className="input-field"
                        value={currentTariffP1Price}
                        onChange={(e) => setCurrentTariffP1Price(e.target.value)}
                        placeholder="Ej: 0.18"
                        required
                      />
                    </div>
                    <div>
                      <label className="form-label">Precio Llano P2 (€/kWh)</label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        className="input-field"
                        value={currentTariffP2Price}
                        onChange={(e) => setCurrentTariffP2Price(e.target.value)}
                        placeholder="Ej: 0.13"
                        required
                      />
                    </div>
                    <div>
                      <label className="form-label">Precio Valle P3 (€/kWh)</label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        className="input-field"
                        value={currentTariffP3Price}
                        onChange={(e) => setCurrentTariffP3Price(e.target.value)}
                        placeholder="Ej: 0.09"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="tariff-grid-2">
                  <div>
                    <label className="form-label">Potencia Punta P1 (kW)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input-field"
                      value={currentPowerP1}
                      onChange={(e) => setCurrentPowerP1(e.target.value)}
                      placeholder="Ej: 3.45"
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">Potencia Valle P2 (kW)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input-field"
                      value={currentPowerP2}
                      onChange={(e) => setCurrentPowerP2(e.target.value)}
                      placeholder="Ej: 3.45"
                      required
                    />
                  </div>
                </div>

                <button type="submit" className="btn-primary">
                  Guardar Tarifa
                </button>
              </form>
            </div>
          </div>

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
                  className="btn-primary"
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