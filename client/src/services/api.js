import axios from "axios";

// Empty in development (Vite proxies /api). Set VITE_API_URL=https://your-backend.example.com when the API is hosted elsewhere.
export const API_ORIGIN = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
// Uploaded images come back as "/uploads/…": make them absolute when the API lives on another origin
export const assetUrl = (u) => (u && u.startsWith("/") ? `${API_ORIGIN}${u}` : u);

const api = axios.create({
  baseURL: `${API_ORIGIN}/api/v1`,
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
    const url = err.config?.url || "";
    const isAuthCall = url.includes("/auth/login") || url.includes("/auth/register");
    const publicPaths = ["/login", "/register", "/track"];
    const onPublicPage = publicPaths.some((p) => window.location.pathname.startsWith(p));
    if (err.response?.status === 401 && !isAuthCall && !onPublicPage) {
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
  classify: (id) => api.post(`/incidents/${id}/classify`),
  merge: (id, data) => api.post(`/incidents/${id}/merge`, data),
  assign: (id, data) => api.post(`/incidents/${id}/assign`, data),
  escalate: (id, data) => api.post(`/incidents/${id}/escalate`, data),
  resolve: (id, data) => api.post(`/incidents/${id}/resolve`, data),
  updateStatus: (id, data) => api.post(`/incidents/${id}/status`, data),
  rejectDuplicate: (id, data) => api.post(`/incidents/${id}/reject-duplicate`, data),
  accept: (id) => api.post(`/incidents/${id}/accept`),
  unmerge: (id) => api.post(`/incidents/${id}/unmerge`),
  regenerateSummary: (id) => api.post(`/incidents/${id}/summary`),
  autoDispatch: (id) => api.post(`/incidents/${id}/auto-dispatch`),
  recall: (id) => api.post(`/incidents/${id}/recall`),
  dismiss: (id, data) => api.post(`/incidents/${id}/dismiss`, data),
  report: (id) => api.get(`/incidents/${id}/report`, { responseType: "blob" }),
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
// `range` is optional: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" } (inclusive). Empty values are dropped.
const rangeParams = (range) => {
  const params = {};
  if (range?.from) params.from = range.from;
  if (range?.to) params.to = range.to;
  return { params };
};

export const analyticsAPI = {
  overview: (range) => api.get("/analytics/overview", rangeParams(range)),
  types: (range) => api.get("/analytics/types", rangeParams(range)),
  severity: (range) => api.get("/analytics/severity", rangeParams(range)),
  responseTime: (range) => api.get("/analytics/response-time", rangeParams(range)),
  hotspots: (range) => api.get("/analytics/hotspots", rangeParams(range)),
  resources: () => api.get("/analytics/resources"),
  shortages: () => api.get("/analytics/shortages"),
  // CSV needs the auth header, so it is fetched as a blob instead of a plain link.
  exportCsv: (range) => api.get("/analytics/export", { ...rangeParams(range), responseType: "blob" }),
};

// ── Notifications ─────────────────────────────────────────────────────────────
export const notificationAPI = {
  list: (params) => api.get("/notifications", { params }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post("/notifications/read-all"),
  getPreferences: () => api.get("/notifications/preferences"),
  updatePreferences: (data) => api.patch("/notifications/preferences", data),
  log: (params) => api.get("/notifications/log", { params }),
  test: (channel) => api.post("/notifications/test", { channel }),
};

// ── Multi-source ingestion ────────────────────────────────────────────────────
export const ingestAPI = {
  simulate: (source) => api.post("/ingest/simulate", { source }),
  simulateScenario: (scenario = "multi_source_fire") => api.post("/ingest/simulate", { scenario }),
  sources: () => api.get("/ingest/sources"),
};

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminAPI = {
  getConfig: () => api.get("/admin/config"),
  updateConfig: (data) => api.put("/admin/config", data),
  listUsers: () => api.get("/admin/users"),
  createUser: (data) => api.post("/admin/users", data),
  updateUser: (id, data) => api.patch(`/admin/users/${id}`, data),
};

// ── Uploads ───────────────────────────────────────────────────────────────────
export const uploadAPI = {
  image: (file) => {
    const fd = new FormData();
    fd.append("image", file);
    // Let the browser set the multipart boundary; drop the JSON default.
    return api.post("/uploads", fd, { headers: { "Content-Type": undefined } });
  },
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
