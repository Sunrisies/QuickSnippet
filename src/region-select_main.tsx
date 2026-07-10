import React from "react";
import ReactDOM from "react-dom/client";
import RegionSelector from "./pages/RegionSelector";
import "./index.css";

ReactDOM.createRoot(document.getElementById("region-root")!).render(
  <React.StrictMode>
    <RegionSelector />
  </React.StrictMode>,
);
