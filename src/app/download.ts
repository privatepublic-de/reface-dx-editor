/** Hands bytes or text to the browser as a file download. */
export function download(name: string, data: Uint8Array | string, type = 'application/octet-stream') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
