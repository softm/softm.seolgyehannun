import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import "@fontsource-variable/noto-sans-kr";
import "ol/ol.css";
import "./styles.css";
import App from "./App";

const Router = import.meta.env.VITE_DEPLOY_TARGET === "github-pages" ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
);
