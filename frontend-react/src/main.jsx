import React from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import "./theme.css";
import App from "./App.jsx";
import { applyTheme, readThemePreference, resolveTheme, systemTheme } from "./utils/theme.js";

applyTheme(resolveTheme(readThemePreference(), systemTheme()));

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
