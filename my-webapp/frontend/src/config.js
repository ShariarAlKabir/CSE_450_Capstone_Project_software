// Base URL for the Label Inspection API.
// Uses the host and protocol that served the page, so the app works from any
// device on the network and keeps working when the frontend is served over HTTPS
// (required for in-browser camera capture from other devices).
export const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:8000`;
