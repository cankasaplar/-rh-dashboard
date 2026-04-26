import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import EngineHost from './EngineHost';
import LoadingShell from '../ui/Panels/LoadingShell';
import Navigation from '../ui/Panels/Navigation';
import StatusHUD from '../ui/HUD/StatusHUD';
import TelemetryPanel from '../ui/HUD/TelemetryPanel';
import CommandTerminal from '../ui/Terminal/CommandTerminal';
const NodesPanel = lazy(() => import('../features/nodes/NodesPanel'));
const ChronosPanel = lazy(() => import('../features/chronos/ChronosPanel'));
const CodexPanel = lazy(() => import('../features/codex/CodexPanel'));
const GhostPanel = lazy(() => import('../features/ghosts/GhostPanel'));
export default function App() { return <div className="h-screen w-full bg-[#010204] text-white font-mono overflow-hidden relative selection:bg-cyan-500/30"><EngineHost /><div className="absolute top-4 left-4 right-4 z-50 grid gap-4 pointer-events-none lg:top-8 lg:left-8 lg:right-auto lg:w-80"><Navigation /><StatusHUD /><Suspense fallback={<LoadingShell />}><Routes><Route path="/" element={<CodexPanel />} /><Route path="/authority" element={<NodesPanel />} /><Route path="/chronos" element={<ChronosPanel />} /><Route path="/codex" element={<CodexPanel />} /><Route path="/ghost" element={<GhostPanel />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Suspense></div><div className="absolute top-4 right-4 z-50 w-72 pointer-events-none hidden xl:block"><TelemetryPanel /></div><div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[500] w-full max-w-2xl px-4 sm:px-8 pointer-events-none"><CommandTerminal /></div></div>; }
