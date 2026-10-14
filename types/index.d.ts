declare module 'claude-code' {
  interface PluginState {
    'secure-apikey': {
      keyNames: string[]
      formName: string
      formValue: string
      status: string | null
      target: string
      customPath: string
      envFiles: string[]
      cwd: string
      fileEntries: { key: string; value: string }[]
    }
  }
}
