import './style.css'
import { App } from './app'

// Register Service Worker for PWA offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        console.log('SW registered:', registration.scope)
        
        // Handle updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available, notify user or skip waiting
                if (confirm('A new version of NNoMes is available. Reload to update?')) {
                  newWorker.postMessage('skipWaiting')
                  window.location.reload()
                }
              }
            })
          }
        })
      })
      .catch((err) => {
        console.error('SW registration failed:', err)
      })
  })
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const splash = document.getElementById('splash')
  const app = new App()
  app.mount(document.getElementById('app')!)
  
  // Hide splash after a brief delay
  setTimeout(() => {
    if (splash) {
      splash.classList.add('splash-hidden')
      setTimeout(() => splash.remove(), 300)
    }
  }, 800)
})
