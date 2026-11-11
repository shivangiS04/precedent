import React from 'react';
import ForgeReconciler from '@forge/react';
import { Shell } from './Shell';

ForgeReconciler.render(
  <React.StrictMode>
    <Shell header="Record this page as a decision" description="Capture form coming soon. It will pre-fill from this page." />
  </React.StrictMode>,
);
