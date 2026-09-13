// Node 25+ defines a browser-style `globalThis.localStorage` accessor that only works with `--localstorage-file` and
// prints an ExperimentalWarning when read. @solana/wallet-adapter-react's WalletProvider feature-detects that global
// in a useState initializer, so the server render (and the build's prerender) touched it. There is no browser storage
// on the server, so the accessor is dropped there and the check sees none, as on older Node. The descriptor is read
// without calling the getter, so this never warns itself; in the browser it does nothing.
if (typeof window === 'undefined') {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  if (descriptor?.get && descriptor.configurable) {
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true, writable: true })
  }
}

export {}
