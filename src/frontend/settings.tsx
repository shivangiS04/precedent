import React from 'react';
import ForgeReconciler from '@forge/react';
import { Shell } from './Shell';

ForgeReconciler.render(
  <React.StrictMode>
    <Shell header="Precedent settings" description="Keyword aliases, conflict comments and Teamwork Graph controls will appear here." />
  </React.StrictMode>,
);
