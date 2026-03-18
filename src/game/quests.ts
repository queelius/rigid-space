import type { TradeState } from './trade'
import type { Builder } from './builder'

export type QuestType = 'deliver' | 'collect' | 'destroy' | 'visit'

export interface Quest {
  id: string
  title: string
  description: string
  giver: string
  type: QuestType
  target: string
  quantity: number
  reward_credits: number
  reward_items?: { type: string; count: number }[]
  completed: boolean
  progress: number  // current count toward quantity
}

export interface QuestYamlEntry {
  id: string
  title: string
  description: string
  type: QuestType
  target: string
  quantity: number
  reward_credits: number
  reward_items?: { type: string; count: number }[]
}

export class QuestLog {
  active: Quest[] = []
  completed: Quest[] = []

  /** Add a quest (from an NPC offering) */
  add(quest: Quest): void {
    // Don't add duplicate quests
    if (this.active.some(q => q.id === quest.id)) return
    if (this.completed.some(q => q.id === quest.id)) return
    this.active.push(quest)
  }

  /** Check if any active quest is fulfilled by an event.
   *  Returns the completed quest or null. */
  check(type: string, target: string, quantity: number): Quest | null {
    for (const quest of this.active) {
      if (quest.type === type && quest.target === target) {
        quest.progress += quantity
        if (quest.progress >= quest.quantity) {
          return quest
        }
      }
    }
    return null
  }

  /** Complete a quest: give rewards, move to completed list */
  complete(quest: Quest, tradeState: TradeState, builder: Builder): void {
    quest.completed = true
    tradeState.credits += quest.reward_credits

    if (quest.reward_items) {
      for (const ri of quest.reward_items) {
        // Use the builder's inventory for item rewards
        const typeNum = parseInt(ri.type)  // type is stored as enum number string
        if (!isNaN(typeNum)) {
          builder.inventory.set(typeNum, (builder.inventory.get(typeNum) ?? 0) + ri.count)
        }
      }
    }

    // Move from active to completed
    const idx = this.active.indexOf(quest)
    if (idx >= 0) this.active.splice(idx, 1)
    this.completed.push(quest)
  }

  /** Get available quests for a given NPC (system quests that haven't been taken) */
  getAvailableForNPC(npcName: string, systemQuests: QuestYamlEntry[]): Quest[] {
    return systemQuests
      .filter(q => !this.active.some(aq => aq.id === q.id) && !this.completed.some(cq => cq.id === q.id))
      .map(q => ({
        ...q,
        giver: npcName,
        completed: false,
        progress: 0,
      }))
  }

  /** Check if there's an active 'visit' quest for this system */
  checkVisit(systemKey: string): Quest | null {
    return this.check('visit', systemKey, 1)
  }
}

/** Render quest log on HUD */
export function renderQuestLog(
  ctx: CanvasRenderingContext2D,
  _w: number, _h: number,
  questLog: QuestLog,
): void {
  if (questLog.active.length === 0) return

  const x = 15
  let y = 120
  ctx.font = '12px monospace'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fa0'
  ctx.fillText('QUESTS:', x, y)
  y += 16

  for (const quest of questLog.active) {
    ctx.fillStyle = '#cc8'
    ctx.fillText(`  ${quest.title}`, x, y)
    y += 14
    ctx.fillStyle = '#888'
    ctx.fillText(`    ${quest.progress}/${quest.quantity} ${quest.target}`, x, y)
    y += 16
  }
}
