const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}