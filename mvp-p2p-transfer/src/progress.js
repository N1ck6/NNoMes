// ============================================
// Progress Tracker
// Calculates speed, ETA, and percentage
// ============================================

export class ProgressTracker {
  constructor(totalSize, callbacks = {}) {
    this.totalSize = totalSize;
    this.current = 0;
    this.startTime = Date.now();
    this.lastUpdate = Date.now();
    this.lastBytes = 0;
    this.speed = 0; // bytes per second
    this.onUpdate = callbacks.onUpdate || (() => {});
    this.onComplete = callbacks.onComplete || (() => {});
    this.completed = false;
  }
  
  update(bytesTransferred) {
    this.current = bytesTransferred;
    const now = Date.now();
    
    // Calculate speed (over last 500ms window)
    const timeDiff = (now - this.lastUpdate) / 1000; // seconds
    const bytesDiff = this.current - this.lastBytes;
    
    if (timeDiff > 0.1) { // Update speed every 100ms minimum
      this.speed = bytesDiff / timeDiff;
      this.lastUpdate = now;
      this.lastBytes = this.current;
    }
    
    // Calculate ETA
    const remaining = this.totalSize - this.current;
    const etaSeconds = this.speed > 0 ? Math.ceil(remaining / this.speed) : 0;
    
    // Calculate percentage
    const percent = this.totalSize > 0 
      ? Math.min(100, (this.current / this.totalSize) * 100) 
      : 0;
    
    // Format stats
    const stats = {
      percent: percent.toFixed(1),
      current: this.formatBytes(this.current),
      total: this.formatBytes(this.totalSize),
      speed: this.formatSpeed(this.speed),
      eta: this.formatETA(etaSeconds)
    };
    
    this.onUpdate(stats);
    
    // Check completion
    if (this.current >= this.totalSize && !this.completed) {
      this.completed = true;
      this.onComplete();
    }
  }
  
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  formatSpeed(bytesPerSec) {
    return this.formatBytes(bytesPerSec) + '/s';
  }
  
  formatETA(seconds) {
    if (seconds <= 0) return 'Done';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }
  
  reset() {
    this.current = 0;
    this.startTime = Date.now();
    this.lastUpdate = Date.now();
    this.lastBytes = 0;
    this.speed = 0;
    this.completed = false;
  }
}
