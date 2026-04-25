import { worldStore } from './store';

const createLocalAgent = (idx, phase = 0) => ({
  pos: {
    lat: Math.sin(idx * 1.7 + phase) * 58,
    lng: ((idx * 47 + phase * 90) % 360) - 180,
  },
});

export const seedLocalAgents = () => {
  worldStore.setState((prev) => {
    const next = new Map(prev.agents);
    for (let idx = 0; idx < 48; idx += 1) {
      next.set(`local-agent-${idx}`, createLocalAgent(idx));
    }
    return { ...prev, agents: next, version: prev.version + 1 };
  });
};
