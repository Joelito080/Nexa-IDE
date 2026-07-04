// Local shims to silence missing/fragmented type declarations during build
declare module '@monaco-editor/react' {
  export const loader: any
  export const DiffEditor: any
  const _default: any
  export default _default
}

declare module '@xterm/xterm' {
  export const Terminal: any
  const _default: any
  export default _default
}

declare module 'three' {
  const THREE: any
  export = THREE
}
