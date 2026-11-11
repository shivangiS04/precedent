import React from 'react';
import ForgeReconciler from '@forge/react';
import { Shell } from './Shell';

ForgeReconciler.render(
  <React.StrictMode>
    <Shell header="Your Decision Ledger is empty" description="Record your first decision to start building team memory." />
  </React.StrictMode>,
);
