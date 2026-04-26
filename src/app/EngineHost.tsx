import { useState } from 'react';
import { useRuntime } from '../hooks/useRuntime';
export default function EngineHost() { const [container, setContainer] = useState<HTMLDivElement | null>(null); useRuntime(container); return <div ref={setContainer} className="absolute inset-0 z-0" />; }
