import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";

const QuestionBankPage = lazy(() => import("./pages/QuestionBankPage"));
const IngestPage = lazy(() => import("./pages/IngestPage"));
const PracticePage = lazy(() => import("./pages/PracticePage"));
const SimulationPage = lazy(() => import("./pages/SimulationPage"));
const SimulationChatPage = lazy(() => import("./pages/SimulationChatPage"));
const ReportPage = lazy(() => import("./pages/ReportPage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const PracticeDetailPage = lazy(() => import("./pages/PracticeDetailPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

export default function App() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">页面加载中...</div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/practice" replace />} />
          <Route path="/bank" element={<QuestionBankPage />} />
          <Route path="/ingest" element={<IngestPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/simulation" element={<SimulationPage />} />
          <Route path="/simulation/:id" element={<SimulationChatPage />} />
          <Route path="/simulation/:id/report" element={<ReportPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/practice/record/:recordId" element={<PracticeDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
