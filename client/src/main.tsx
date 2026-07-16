import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@picocss/pico/css/pico.min.css";
import "./index.css";
import { Layout } from "@/components/Layout";
import { Home } from "@/pages/Home";
import { Add } from "@/pages/Add";
import { Review } from "@/pages/Review";
import { Dictionary } from "@/pages/Dictionary";
import { Settings } from "@/pages/Settings";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/add" element={<Add />} />
          <Route path="/review" element={<Review />} />
          <Route path="/dictionary" element={<Dictionary />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  </StrictMode>,
);
