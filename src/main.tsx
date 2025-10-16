import * as React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './renderer/App';

const container = document.getElementById('root')!;
createRoot(container).render(<App />);
