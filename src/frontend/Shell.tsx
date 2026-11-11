import React, { useEffect, useState } from 'react';
import { EmptyState, SectionMessage, Spinner, Stack, Text, Inline, Lozenge } from '@forge/react';
import { makeInvoke } from '@forge/bridge';
import type { Defs, HealthInfo } from '../shared/types';

const invoke = makeInvoke<Defs>();

/** Shared M0 shell: proves resolver + Forge SQL wiring, then shows the surface's empty state. */
export const Shell = ({ header, description }: { header: string; description: string }) => {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    invoke('getHealth').then(setHealth).catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <SectionMessage appearance="error" title="Precedent is unavailable">
        <Text>The backend could not be reached. Try reloading the page.</Text>
      </SectionMessage>
    );
  }
  if (!health) return <Spinner label="Loading Precedent" />;

  return (
    <Stack space="space.200">
      <EmptyState header={header} description={description} />
      <Inline space="space.100" alignBlock="center">
        <Text>Database</Text>
        <Lozenge appearance={health.database === 'ready' ? 'success' : health.database === 'migrating' ? 'inprogress' : 'removed'}>
          {health.database}
        </Lozenge>
        {health.decisionCount !== null && <Text>{`${health.decisionCount} decisions recorded`}</Text>}
      </Inline>
    </Stack>
  );
};
