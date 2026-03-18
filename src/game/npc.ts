import Anthropic from '@anthropic-ai/sdk'
import { getConfig } from '../config/loader'

export interface NPC {
  name: string
  personality: string
  relationship: number       // -100 to 100
  inventory: string[]
  conversation: { role: 'user' | 'assistant'; content: string }[]
}

export interface DialogResponse {
  speech: string
  actions: string[]
}

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (client) return client
  let key = sessionStorage.getItem('anthropic_key')
  if (!key) {
    key = prompt('Enter your Anthropic API key for NPC dialog:')
    if (key) {
      sessionStorage.setItem('anthropic_key', key)
    }
  }
  client = new Anthropic({
    apiKey: key || '',
    dangerouslyAllowBrowser: true,
  })
  return client
}

/** Send a message to an NPC and get a response via Anthropic API */
export async function npcDialog(
  npc: NPC,
  playerMessage: string,
  gameContext?: string,
): Promise<DialogResponse> {
  const anthropic = getClient()

  const systemPrompt = [
    `You are ${npc.name}, a character at a space station in a 2D space sandbox game.`,
    `Personality: ${npc.personality}.`,
    `Relationship with player: ${npc.relationship > 0 ? 'friendly' : npc.relationship < 0 ? 'hostile' : 'neutral'} (${npc.relationship}/100).`,
    npc.inventory.length > 0 ? `You have these items to trade: ${npc.inventory.join(', ')}.` : '',
    gameContext ? `Current game state: ${gameContext}` : '',
    '',
    'Respond in character with 1-3 short sentences of dialog.',
    'After your speech, optionally include actions on separate lines prefixed with [ACTION]: ',
    'Possible actions: [ACTION]:TRADE_OFFER <item>, [ACTION]:REPUTATION_UP, [ACTION]:REPUTATION_DOWN, [ACTION]:HINT <text>',
    'Keep responses brief and in-character. This is a game, not a novel.',
  ].filter(Boolean).join('\n')

  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    ...npc.conversation.slice(-6),  // Keep last 6 turns for context
    { role: 'user', content: playerMessage },
  ]

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: systemPrompt,
      messages,
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Parse actions from response
    const lines = text.split('\n')
    const speechLines: string[] = []
    const actions: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('[ACTION]:')) {
        actions.push(trimmed.slice(9).trim())
      } else if (trimmed.length > 0) {
        speechLines.push(trimmed)
      }
    }

    const speech = speechLines.join(' ')

    // Store conversation history
    npc.conversation.push({ role: 'user', content: playerMessage })
    npc.conversation.push({ role: 'assistant', content: speech })

    // Process actions that affect NPC state
    for (const action of actions) {
      if (action === 'REPUTATION_UP') {
        npc.relationship = Math.min(100, npc.relationship + 10)
      } else if (action === 'REPUTATION_DOWN') {
        npc.relationship = Math.max(-100, npc.relationship - 10)
      }
    }

    return { speech, actions }
  } catch (err) {
    // API error -- return a fallback response
    const fallback = `*static crackle* Signal interference... try again. (${err instanceof Error ? err.message : 'unknown error'})`
    return { speech: fallback, actions: [] }
  }
}

/** Get default NPC inventory from config, with hardcoded fallback */
function getDefaultInventory(): string[] {
  try {
    return [...getConfig().npcs.npc_pool.default_inventory]
  } catch {
    return ['fuel cells', 'iron plating', 'crystal shards']
  }
}

/** Create an NPC from station data */
export function createNPC(name: string, personality: string): NPC {
  return {
    name,
    personality,
    relationship: 0,
    inventory: getDefaultInventory(),
    conversation: [],
  }
}
