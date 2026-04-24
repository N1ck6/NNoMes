import qrcode from 'qrcode-generator'

/**
 * Generate a QR code as an SVG string
 * @param data The data to encode
 * @param size The size in pixels (default 240)
 * @returns SVG string
 */
export function generateQRSVG(data: string, size: number = 240): string {
  const typeNumber = getTypeNumber(data)
  const errorCorrectionLevel = 'L'
  const qr = qrcode(typeNumber, errorCorrectionLevel)
  qr.addData(data)
  qr.make()
  
  const cellSize = Math.floor(size / qr.getModuleCount())
  const margin = 4
  const actualSize = cellSize * qr.getModuleCount() + margin * 2
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${actualSize} ${actualSize}" width="${size}" height="${size}">`
  svg += `<rect width="${actualSize}" height="${actualSize}" fill="white"/>`
  
  for (let r = 0; r < qr.getModuleCount(); r++) {
    for (let c = 0; c < qr.getModuleCount(); c++) {
      if (qr.isDark(r, c)) {
        svg += `<rect x="${margin + c * cellSize}" y="${margin + r * cellSize}" width="${cellSize}" height="${cellSize}" fill="#0e1621"/>`
      }
    }
  }
  
  svg += '</svg>'
  return svg
}

/**
 * Generate a QR code as a data URL (for image src)
 */
export function generateQRDataURL(data: string, size: number = 240): string {
  const svg = generateQRSVG(data, size)
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  return URL.createObjectURL(blob)
}

/**
 * Estimate the QR type number needed for the data
 */
function getTypeNumber(data: string): number {
  const length = data.length
  if (length <= 25) return 1
  if (length <= 47) return 2
  if (length <= 77) return 3
  if (length <= 114) return 4
  if (length <= 154) return 5
  if (length <= 195) return 6
  if (length <= 224) return 7
  if (length <= 279) return 8
  if (length <= 335) return 9
  if (length <= 395) return 10
  if (length <= 468) return 11
  if (length <= 535) return 12
  if (length <= 619) return 13
  if (length <= 667) return 14
  if (length <= 758) return 15
  if (length <= 854) return 16
  if (length <= 938) return 17
  if (length <= 1046) return 18
  if (length <= 1153) return 19
  if (length <= 1249) return 20
  if (length <= 1352) return 21
  if (length <= 1460) return 22
  if (length <= 1588) return 23
  if (length <= 1704) return 24
  if (length <= 1853) return 25
  if (length <= 1990) return 26
  if (length <= 2132) return 27
  if (length <= 2223) return 28
  if (length <= 2369) return 29
  if (length <= 2520) return 30
  if (length <= 2677) return 31
  if (length <= 2840) return 32
  if (length <= 3009) return 33
  if (length <= 3182) return 34
  if (length <= 3351) return 35
  if (length <= 3537) return 36
  if (length <= 3729) return 37
  if (length <= 3927) return 38
  if (length <= 4087) return 39
  return 40
}

/**
 * Compress SDP data for smaller QR codes
 */
export function compressSDP(sdp: string): string {
  // Remove unnecessary lines and compress common patterns
  let compressed = sdp
    .replace(/a=ice-options:trickle\s\n/g, '')
    .replace(/a=extmap-\d+ .+\n/g, '')
    .replace(/a=setup:actpass\n/g, '')
    .replace(/a=mid:0\n/g, '')
    .replace(/a=msid:.+\n/g, '')
    .replace(/v=0\n/g, '')
    .replace(/s=-\n/g, '')
    .replace(/t=0 0\n/g, '')
    .replace(/a=group:BUNDLE 0\n/g, '')
  
  // Only keep host candidates for local LAN transfer
  const lines = compressed.split('\n')
  const filtered = lines.filter(line => {
    if (line.startsWith('a=candidate:') && line.includes('typ srflx')) return false
    if (line.startsWith('a=candidate:') && line.includes('typ relay')) return false
    return true
  })
  
  return filtered.join('\n')
}

/**
 * Encode offer/answer for URL fragment
 */
export function encodeForURL(data: string): string {
  try {
    // Use TextEncoder and base64url encoding
    const bytes = new TextEncoder().encode(data)
    const base64 = btoa(String.fromCharCode(...bytes))
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  } catch {
    // Fallback for larger data
    return btoa(unescape(encodeURIComponent(data)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
}

/**
 * Decode from URL fragment
 */
export function decodeFromURL(encoded: string): string {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padding = '='.repeat((4 - base64.length % 4) % 4)
    const str = atob(base64 + padding)
    const bytes = new Uint8Array(str.length)
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
  } catch {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padding = '='.repeat((4 - base64.length % 4) % 4)
    return decodeURIComponent(escape(atob(base64 + padding)))
  }
}
