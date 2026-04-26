import { useCallback, useState } from 'react';
import { useRuntime } from '../hooks/useRuntime';

export default function EngineHost() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const bindContainer = useCallback((node: HTMLDivElement | null) => { setContainer(node); }, []);
  useRuntime(container);
  return <div ref={bindContainer} className="absolute inset-0 z-0" />;
}
