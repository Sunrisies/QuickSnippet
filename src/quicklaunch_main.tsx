import React from "react";
import ReactDOM from "react-dom/client";
import QuickLaunchWindow from "./pages/QuickLaunchWindow";
import "./index.css";

ReactDOM.createRoot(document.getElementById("ql-root")!).render(
  <React.StrictMode>
    <QuickLaunchWindow />
  </React.StrictMode>,
);
