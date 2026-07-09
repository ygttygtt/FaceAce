import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import QuestionBankPage from "./pages/QuestionBankPage";
import IngestPage from "./pages/IngestPage";
import PracticePage from "./pages/PracticePage";
import SimulationListPage from "./pages/SimulationListPage";
import NewSimulationPage from "./pages/NewSimulationPage";
import SimulationPage from "./pages/SimulationPage";
import ReportPage from "./pages/ReportPage";
import HistoryPage from "./pages/HistoryPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/practice" replace />} />
        <Route path="/bank" element={<QuestionBankPage />} />
        <Route path="/ingest" element={<IngestPage />} />
        <Route path="/practice" element={<PracticePage />} />
        <Route path="/simulation" element={<SimulationListPage />} />
        <Route path="/simulation/new" element={<NewSimulationPage />} />
        <Route path="/simulation/:id" element={<SimulationPage />} />
        <Route path="/simulation/:id/report" element={<ReportPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
