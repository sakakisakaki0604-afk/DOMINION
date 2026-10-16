import { CARDS, SRC } from '../js/cards.js';
import { writeFileSync } from 'fs';
const rows = Object.values(CARDS).map((c) => `| ${c.id} | ${c.name} | ${c.name_ja} | ${c.cost} | ${c.types.join('/')} | ${c.set} | ${SRC.confidence} |`);
writeFileSync(new URL('../docs/CARD_LEDGER.md', import.meta.url), `# カード台帳（自動生成）\n\n全カードの確度は \`${SRC.confidence}\`（${SRC.note}）\n根拠: ${SRC.refs.join(', ')}\n\n| ID | 英語名 | 日本語名(仮訳含む) | コスト | タイプ | セット | 確度 |\n|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`);
console.log(rows.length, 'cards');
