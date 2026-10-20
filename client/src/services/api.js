import axios from "axios";

const api = axios.create({
  baseURL: "/api/v1",
  timeout: 20000,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ps9_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("ps9_token");
      localStorage.removeItem("ps9_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (data) => api.post("/auth/login", data),
  register: (data) => api.post("/auth/register", data),
  me: () => api.get("/auth/me"),
};

// ── Incidents ─────────────────────────────────────────────────────────────────
export const incidentAPI = {
  create: (data) => api.post("/incidents", data),
  list: (params) => api.get("/incidents", { params }),
  get: (id) => api.get(`/incidents/${id}`),
  update: (id, data) => api.patch(`/incidents/${id}`, data),
  update: (id, data) => api.patch(`/incidents/${id}`, data),
  classify: (id) => api.post(`/incidents/${id}/classify`),
  merge: (id, data) => api.post(`/incidents/${id}/merge`, data),
  assign: (id, data) => api.post(`/incidents/${id}/assign`, data),
  escalate: (id, data) => api.post(`/incidents/${id}/escalate`, data),
  resolve: (id, data) => api.post(`/incidents/${id}/resolve`, data),
  updateStatus: (id, data) => api.post(`/incidents/${id}/status`, data),
};

// ── Resources ─────────────────────────────────────────────────────────────────
export const resourceAPI = {
  list: (params) => api.get("/resources", { params }),
  get: (id) => api.get(`/resources/${id}`),
  updateStatus: (id, data) => api.patch(`/resources/${id}/status`, data),
  recommendations: (incidentId) => api.get(`/resources/recommendations/${incidentId}`),
  seed: () => api.post("/resources/seed"),
};

// ── Alerts ────────────────────────────────────────────────────────────────────
export const alertAPI = {
  list: (params) => api.get("/alerts", { params }),
  acknowledge: (id) => api.patch(`/alerts/${id}/acknowledge`),
};

// ── Analytics ─────────────────────────────────────────────────────────────────
export const analyticsAPI = {
  overview: () => api.get("/analytics/overview"),
  types: () => api.get("/analytics/types"),
  severity: () => api.get("/analytics/severity"),
  responseTime: () => api.get("/analytics/response-time"),
  hotspots: () => api.get("/analytics/hotspots"),
};

// ── Demo ──────────────────────────────────────────────────────────────────────
export const demoAPI = {
  marketFire: () => api.post("/demo/market-fire", { scenario: "market_fire" }),
};

// ── Health ────────────────────────────────────────────────────────────────────
export const healthAPI = {
  check: () => axios.get("/health"),
};

export default api;
