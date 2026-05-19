import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
// import App from './SimpleApp.tsx'

import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary'

// Simple debug log to confirm execution starts
console.log('Mounting React App...');

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

try {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  )
} catch (error) {
  console.error("React Mount Failed:", error);
}
