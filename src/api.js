const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "";

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}
