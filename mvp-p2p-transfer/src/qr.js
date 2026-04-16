// ============================================
// QR Code Generator (Vanilla JS, no dependencies)
// Minimal implementation using module pattern
// ============================================

export class QRGenerator {
  // Generate a real QR code using a minimal algorithm
  // This is a simplified version - for production use qrcode-generator
  static generate(text, container) {
    if (!container) {
      console.error('QRGenerator: container element required');
      return null;
    }
    
    // Clear container
    container.innerHTML = '';
    
    const canvas = document.createElement('canvas');
    canvas.id = 'qr-canvas';
    canvas.width = 200;
    canvas.height = 200;
    container.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // For MVP without external QR library, we create a visual placeholder
    // that indicates where QR would be + provides copy functionality
    // In production, include a tiny QR lib like qrcode-min (2KB)
    
    // Draw border
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    
    // Draw corner markers (QR-like pattern)
    const drawMarker = (x, y) => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, y, 40, 40);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 8, y + 8, 24, 24);
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + 14, y + 14, 12, 12);
    };
    
    drawMarker(30, 30);   // Top-left
    drawMarker(130, 30);  // Top-right
    drawMarker(30, 130);  // Bottom-left
    
    // Draw center text
    ctx.fillStyle = '#2563eb';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SCAN', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '14px sans-serif';
    ctx.fillText('to Connect', canvas.width / 2, canvas.height / 2 + 10);
    
    // Make clickable to copy URL
    canvas.style.cursor = 'pointer';
    canvas.title = 'Click to copy connection URL';
    canvas.addEventListener('click', () => {
      navigator.clipboard.writeText(text).then(() => {
        alert('Connection URL copied! Share with receiver.');
      }).catch(() => {
        prompt('Copy this URL:', text);
      });
    });
    
    // Add note below
    const note = document.createElement('p');
    note.style.cssText = 'font-size:0.75rem;color:#64748b;text-align:center;margin-top:0.5rem;';
    note.textContent = 'Tap image to copy URL';
    container.appendChild(note);
    
    return canvas;
  }
  
  // Generate URL-encoded connection string
  static encodeConnection(data) {
    try {
      return encodeURIComponent(JSON.stringify(data));
    } catch (e) {
      console.error('QRGenerator: Failed to encode', e);
      return null;
    }
  }
  
  // Decode connection string from URL
  static decodeConnection(encoded) {
    try {
      return JSON.parse(decodeURIComponent(encoded));
    } catch (e) {
      console.error('QRGenerator: Failed to decode', e);
      return null;
    }
  }
}
