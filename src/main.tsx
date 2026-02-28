import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageProvider } from './context/LanguageContext'
import { AccessMatrixProvider } from './context/AccessMatrixContext'
import AppErrorBoundary from './components/AppErrorBoundary'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <LanguageProvider>
        <AccessMatrixProvider>
          <App />
        </AccessMatrixProvider>
      </LanguageProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
