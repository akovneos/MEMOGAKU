import React from "./react-shim.js";
import ReactDOM from "./react-dom-shim.js";
import App from "./App.jsx";
import "./style.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
