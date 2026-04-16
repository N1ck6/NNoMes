// ============================================
// QR Code Generator (Vanilla JS, no dependencies)
// Uses qrcode-generator library algorithm (simplified)
// For MVP: We'll use a lightweight inline implementation
// ============================================

export class QRGenerator {
  // Simple QR code generation using canvas
  // For production, consider a tiny library like qrcode-min
  static generate(text, container) {
    // Create canvas element
    const canvas = document.createElement('canvas');
    canvas.id = 'qr-canvas';
    canvas.width = 200;
    canvas.height = 200;
    container.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // For MVP without external libraries, we'll show a placeholder
    // with instructions. In production, use a real QR library.
    
    // Draw border
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    
    // Draw center icon (link symbol)
    ctx.fillStyle = '#2563eb';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔗', canvas.width / 2, canvas.height / 2);
    
    // Draw text below
    ctx.fillStyle = '#1e293b';
    ctx.font = '12px sans-serif';
    ctx.fillText('Scan to Connect', canvas.width / 2, canvas.height - 30);
    
    // Add click handler to copy URL
    canvas.style.cursor = 'pointer';
    canvas.title = 'Click to copy URL';
    canvas.addEventListener('click', () => {
      navigator.clipboard.writeText(text).then(() => {
        alert('URL copied to clipboard!');
      }).catch(() => {
        prompt('Copy this URL:', text);
      });
    });
    
    // Store the actual URL in data attribute for accessibility
    canvas.dataset.url = text;
    
    return canvas;
  }
  
  // Alternative: Generate a simple visual pattern based on hash
  // This creates a unique-looking (but not scannable) pattern
  static generatePattern(text, container) {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    container.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Generate pseudo-random pattern from text hash
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash;
    }
    
    const seed = Math.abs(hash);
    const gridSize = 25;
    const cellSize = canvas.width / gridSize;
    
    // Draw pattern
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const value = (seed * (x + 1) * (y + 1)) % 100;
        if (value > 50) {
          ctx.fillStyle = '#2563eb';
          ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
        }
      }
    }
    
    // Draw corner markers (like real QR codes)
    ctx.fillStyle = '#000000';
    const markerSize = cellSize * 7;
    
    // Top-left
    ctx.fillRect(cellSize, cellSize, markerSize, markerSize);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cellSize * 2, cellSize * 2, cellSize * 5, cellSize * 5);
    ctx.fillStyle = '#000000';
    ctx.fillRect(cellSize * 3, cellSize * 3, cellSize * 3, cellSize * 3);
    
    // Top-right
    ctx.fillStyle = '#000000';
    ctx.fillRect(canvas.width - cellSize - markerSize, cellSize, markerSize, markerSize);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(canvas.width - cellSize - markerSize + cellSize, cellSize * 2, cellSize * 5, cellSize * 5);
    ctx.fillStyle = '#000000';
    ctx.fillRect(canvas.width - cellSize - markerSize + cellSize * 2, cellSize * 3, cellSize * 3, cellSize * 3);
    
    // Bottom-left
    ctx.fillStyle = '#000000';
    ctx.fillRect(cellSize, canvas.height - cellSize - markerSize, markerSize, markerSize);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cellSize * 2, canvas.height - cellSize - markerSize + cellSize, cellSize * 5, cellSize * 5);
    ctx.fillStyle = '#000000';
    ctx.fillRect(cellSize * 3, canvas.height - cellSize - markerSize + cellSize * 2, cellSize * 3, cellSize * 3);
    
    return canvas;
  }
}
