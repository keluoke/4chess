// Store title/summary and extension metadata share a single bilingual source.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const copy = JSON.parse(fs.readFileSync(path.join(root, 'chrome-web-store/listing-copy.json')));
const write = process.argv.includes('--write');
const count = text => [...text].length;
const outputs = {};
const submission = fs.readFileSync(path.join(root,'chrome-web-store/SUBMISSION_CHECKLIST.md'),'utf8');
for (const locale of ['en', 'zh_CN']) {
  const entry = copy[locale];
  assert(count(entry.title) <= 75, locale+' title exceeds Chrome limit');
  assert(count(entry.summary) <= 132, locale+' summary exceeds Chrome limit');
  assert(!/[\r\n<>]/.test(entry.summary), 'Summary must be a plain-text single line');
  assert(entry.description.includes('Maia') && entry.description.includes('Stockfish'));
  assert(submission.includes(copy.singlePurpose[locale]), 'Submission purpose drift: '+locale);
  const file = '_locales/'+locale+'/messages.json';
  const messages = JSON.parse(fs.readFileSync(path.join(root, file)));
  messages.extensionName.message = entry.title;
  messages.extensionDescription.message = entry.summary;
  outputs[file] = JSON.stringify(messages,null,2)+'\n';
  outputs['chrome-web-store/listing-'+(locale === 'en' ? 'en' : 'zh-CN')+'.txt'] = entry.description+'\n';
}
let guide = `# Diverge · Chrome Web Store 双语商品文案\n\n以 listing-copy.json 为文案来源；修改后执行 node scripts/sync_store_copy.mjs --write。默认检查不会改文件。\n\n默认语言 English，另填写简体中文商品详情。安装包包含本地化标题与摘要；详细说明仍需分别在商店后台填写。标题不超过 75 字符，摘要不超过 132 字符，以下长度自动核对。\n\n`;
for (const [locale,label] of [['en','English'],['zh_CN','简体中文']]) {
  const entry = copy[locale];
  guide += `## ${label}\n\n名称（${count(entry.title)}/75）：\n\n\`\`\`text\n${entry.title}\n\`\`\`\n\n摘要（${count(entry.summary)}/132）：\n\n\`\`\`text\n${entry.summary}\n\`\`\`\n\n详细说明（可直接粘贴；同 listing-${locale === 'en' ? 'en' : 'zh-CN'}.txt）：\n\n\`\`\`text\n${entry.description}\n\`\`\`\n\n`;
}
guide += `## 搜索展示与提交\n\n标题保留品牌、Chess Analysis、Scanner、Human Intuition；摘要补充 Stockfish、Maia、网页棋图和支持的平台。详细说明将 chessboard scanner、PGN、FEN、game review、heatmap 等词放在实际功能中，避免重复关键词列表、竞品名或排名承诺。搜索展示还受使用体验、评价和留存等因素影响，文案不能保证名次。\n\n- English 与简体中文分别填写；不把两个长说明拼成同一语言页面。\n- 截图应与实际功能相符；旧版全盘复盘示例仍是其中一个场景。\n- 单一用途说明、权限理由与 Website Content 数据披露使用 [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md)。\n- 隐私政策：https://4chess.cc/privacy/；指南：https://4chess.cc/guide/。\n- 本地文件更新不等于后台商品详情已提交或通过审核。\n\n依据：[Chrome 商店文案指南](https://developer.chrome.com/docs/webstore/best-listing)、[商品信息与关键词规范](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements/)、[Manifest 字段限制](https://developer.chrome.com/docs/extensions/reference/manifest)。\n`;
outputs['chrome-web-store/STORE_LISTING.md'] = guide;
for (const [file,body] of Object.entries(outputs)) {
  if (write) fs.writeFileSync(path.join(root,file),body);
  else assert.equal(fs.readFileSync(path.join(root,file),'utf8'),body,'Product copy drift: '+file);
}
console.log((write ? 'UPDATED' : 'PASS')+' bilingual store copy, localized metadata, 75/132 limits and plain-text exports');
