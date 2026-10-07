import React from 'react';
import { createRoot } from 'react-dom/client';
import { initializeCloud } from '@/lib/cloud';
import App from '@/components/cloud-app';
import '@/app/globals.css';
async function start(){let error='';try{await initializeCloud();}catch{error='Could not load cloud configuration. Reconnect and reload to sign in. Your saved notebook remains on this device.';}createRoot(document.getElementById('root')!).render(<React.StrictMode><App configurationError={error}/></React.StrictMode>);}
void start();
