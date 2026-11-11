import React from 'react';
import ForgeReconciler from '@forge/react';
import { Shell } from './Shell';

ForgeReconciler.render(
  <React.StrictMode>
    <Shell header="Precedent" description="Open the Precedent panel for decisions related to this work item." />
  </React.StrictMode>,
);
