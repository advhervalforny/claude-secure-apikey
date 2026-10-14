import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const PANE = 'secure-apikey'

const keyNames    = atom({ plugin: 'secure-apikey', key: 'keyNames'    } as const, [] as string[])
const formName    = atom({ plugin: 'secure-apikey', key: 'formName'    } as const, '')
const formValue   = atom({ plugin: 'secure-apikey', key: 'formValue'   } as const, '')
const status      = atom({ plugin: 'secure-apikey', key: 'status'      } as const, null as string | null)
const target      = atom({ plugin: 'secure-apikey', key: 'target'      } as const, '__store__')
const customPath  = atom({ plugin: 'secure-apikey', key: 'customPath'  } as const, '')
const envFiles    = atom({ plugin: 'secure-apikey', key: 'envFiles'    } as const, [] as string[])
const cwd         = atom({ plugin: 'secure-apikey', key: 'cwd'         } as const, '')
const fileEntries = atom({ plugin: 'secure-apikey', key: 'fileEntries' } as const, [] as { key: string; value: string }[])

// Reconstruct real value from masked field delta.
// The field always shows '*'; typing appends real chars, backspace trims.
// A paste that contains no '*' (e.g. sk-ant-…) is accepted as-is.
function applyMaskedDelta(prev: string, incoming: string): string {
  if (incoming.length === 0) return ''
  if (!incoming.includes('*')) return incoming
  const mask = '*'.repeat(prev.length)
  if (incoming.startsWith(mask)) return prev + incoming.slice(mask.length)
  if (incoming.length < prev.length) return prev.slice(0, incoming.length)
  return prev
}

// Show last 4 chars, rest masked — makes keys recognisable without exposing them
function maskValue(value: string): string {
  if (value.length === 0) return ''
  if (value.length <= 4) return '*'.repeat(value.length)
  return '*'.repeat(value.length - 4) + value.slice(-4)
}

function parseEnv(content: string): { key: string; value: string }[] {
  return content
    .split('\n')
    .filter(l => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(l) && !l.trimStart().startsWith('#'))
    .map(l => {
      const eq  = l.indexOf('=')
      const key = l.slice(0, eq).trim()
      let   val = l.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      return { key, value: val }
    })
}

function upsertEnvLine(content: string, key: string, value: string): string {
  const lines = content.split('\n')
  const re    = new RegExp(`^\\s*${key}\\s*=`)
  const idx   = lines.findIndex(l => re.test(l))
  if (idx >= 0) {
    lines[idx] = `${key}=${value}`
    return lines.join('\n')
  }
  const trimmed = content.trimEnd()
  return trimmed ? `${trimmed}\n${key}=${value}\n` : `${key}=${value}\n`
}

async function scanEnvFiles($: any) {
  const entries = await $.fs.list() as { name: string; kind: string }[]
  const found   = entries.filter(e => e.kind === 'file' && /^\.env/.test(e.name)).map(e => e.name)
  await update($, envFiles, () => found)
}

async function loadFileEntries($: any, filePath: string) {
  if (!filePath || filePath === '__store__' || filePath === '__custom__') {
    await update($, fileEntries, () => [])
    return
  }
  try {
    const content = (await $.fs.read(filePath)) as string
    await update($, fileEntries, () => parseEnv(content))
  } catch {
    await update($, fileEntries, () => [])
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'apikey',
      description: 'Store API keys securely — values never appear in the chat',
    })
    const [stored, dir] = await Promise.all([
      $.store.get('apikey_keys'),
      $.session.cwd(),
    ])
    if (Array.isArray(stored)) await update($, keyNames, () => stored as string[])
    await update($, cwd, () => dir as string)
    await scanEnvFiles($)
    return next(e)
  })

  on('command.run', { command: 'apikey' }, async $ => {
    await scanEnvFiles($)
    const dir = await $.session.cwd()
    await update($, cwd, () => dir as string)
    const tgt = await read($, target)
    await loadFileEntries($, tgt)
    await $.ui.open({ id: PANE, title: 'API Keys' })
    return { text: 'API Keys pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Input, Button, Select } = $.ui.resolve(e)

    const names   = await read($, keyNames)
    const name    = await read($, formName)
    const val     = await read($, formValue)
    const msg     = await read($, status)
    const tgt     = await read($, target)
    const cPath   = await read($, customPath)
    const files   = await read($, envFiles)
    const dir     = await read($, cwd)
    const entries = await read($, fileEntries)

    const masked     = '*'.repeat(val.length)
    const activeFile = tgt !== '__store__' && tgt !== '__custom__' ? tgt
      : tgt === '__custom__' ? cPath.trim()
      : null

    const selectOptions = [
      { value: '__store__', label: 'Internal storage only' },
      ...files.map(f => ({ value: f, label: f })),
      { value: '__custom__', label: 'Other file...' },
    ]

    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text bold>API Keys</Text>
        {dir !== '' && <Text dimColor>Project: {dir}</Text>}

        {msg !== null && (
          <Box marginTop={1}>
            <Text color={msg.startsWith('✓') ? 'green' : 'yellow'}>{msg}</Text>
          </Box>
        )}

        {/* ── Destination ── */}
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Destination:</Text>
          <Select
            key="target-file"
            label="File:    "
            options={selectOptions}
            value={tgt}
            onSelect={v => {
              void (async () => {
                await update($, target, () => v)
                await loadFileEntries($, v)
              })()
            }}
          />
          {tgt === '__custom__' && (
            <Input
              key="custom-path"
              label="Path:    "
              placeholder=".env.production"
              value={cPath}
              onInput={v  => update($, customPath, () => v)}
              onSubmit={v => {
                void (async () => {
                  await update($, customPath, () => v)
                  await loadFileEntries($, v)
                })()
              }}
            />
          )}
        </Box>

        {/* ── File preview ── */}
        {activeFile && (
          <Box flexDirection="column" marginTop={1}>
            <Box>
              <Text dimColor>Contents of {activeFile}:</Text>
              {'  '}
              <Button
                key="reload-file"
                label="Refresh"
                onPress={() => loadFileEntries($, activeFile)}
              />
            </Box>
            {entries.length === 0
              ? <Text dimColor>  (file is empty or not found)</Text>
              : entries.map(entry => {
                  const isMatch = name.trim() !== '' &&
                    entry.key.toLowerCase() === name.trim().toLowerCase()
                  return (
                    <Box key={entry.key} marginLeft={1}>
                      <Text color={isMatch ? 'yellow' : undefined} bold={isMatch}>
                        {entry.key}
                      </Text>
                      <Text dimColor>  =  </Text>
                      <Text dimColor>{maskValue(entry.value)}</Text>
                      {isMatch && <Text color="yellow">  ← already exists</Text>}
                    </Box>
                  )
                })
            }
          </Box>
        )}

        {/* ── Form ── */}
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Add / update key:</Text>
          <Input
            key="key-name"
            label="Name:  "
            placeholder="e.g. OPENAI_API_KEY"
            value={name}
            autoFocus
            onInput={v  => update($, formName, () => v)}
            onSubmit={v => update($, formName, () => v)}
          />
          <Input
            key="key-value"
            label="Value: "
            placeholder="Paste here and press Enter to save"
            value={masked}
            onInput={v => {
              void (async () => {
                const prev = await read($, formValue)
                await update($, formValue, () => applyMaskedDelta(prev, v))
              })()
            }}
            onSubmit={_ => {
              void (async () => {
                const n   = (await read($, formName)).trim()
                const raw = (await read($, formValue)).trim()
                if (!n || !raw) {
                  await update($, status, () => '⚠ Fill in both name and value.')
                  return
                }

                await $.store.set(`apikey_${n}`, raw)
                const current  = await read($, keyNames)
                const newNames = [...current.filter(k => k !== n), n]
                await $.store.set('apikey_keys', newNames)
                await update($, keyNames, () => newNames)

                const tgtNow   = await read($, target)
                const cPathNow = await read($, customPath)
                const filePath = tgtNow === '__store__' ? null
                  : tgtNow === '__custom__'              ? cPathNow.trim()
                  : tgtNow

                if (filePath) {
                  let content = ''
                  try { content = (await $.fs.read(filePath)) as string } catch { /* new file */ }
                  await $.fs.write(filePath, upsertEnvLine(content, n, raw))
                  await loadFileEntries($, filePath)
                  await update($, formName,  () => '')
                  await update($, formValue, () => '')
                  await update($, status,    () => `✓ "${n}" written to ${filePath}.`)
                } else {
                  await update($, formName,  () => '')
                  await update($, formValue, () => '')
                  await update($, status,    () => `✓ "${n}" saved to internal storage.`)
                }
              })()
            }}
          />
          {val.length > 0 && (
            <Text dimColor>  {val.length} character{val.length !== 1 ? 's' : ''} entered</Text>
          )}
        </Box>

        {/* ── Internal storage list ── */}
        {names.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>Keys in internal storage:</Text>
            {names.map(n => (
              <Box key={n} marginLeft={1}>
                <Text>• {n}  </Text>
                <Button
                  key={`del-${n}`}
                  label="Delete"
                  onPress={() => {
                    void (async () => {
                      await $.store.delete(`apikey_${n}`)
                      const current  = await read($, keyNames)
                      const newNames = current.filter(k => k !== n)
                      await $.store.set('apikey_keys', newNames)
                      await update($, keyNames, () => newNames)
                      await update($, status,   () => `✓ "${n}" removed from internal storage.`)
                    })()
                  }}
                />
              </Box>
            ))}
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>Values never appear in the chat transcript.</Text>
        </Box>
      </Box>
    )
  })
}
